pub mod activity;
pub mod manager;

use anyhow::{anyhow, Result};
use base64::Engine;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::thread;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::ipc::protocol::Event;
use crate::pty::activity::detect_activity;

const SCROLLBACK_BYTES: usize = 1_000_000;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionInfo {
    pub id: Uuid,
    pub name: String,
    pub shell: String,
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

pub struct Session {
    pub info: SessionInfo,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
    pub scrollback: Arc<Mutex<VecDeque<u8>>>,
}

pub fn spawn_session(
    events: broadcast::Sender<Event>,
    name: String,
    shell: String,
    shell_args: Vec<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<Session> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| anyhow!("openpty failed: {e}"))?;

    let effective_cwd = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(Path::new)
        .map(Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(shell_args);
    if let Some(cwd) = effective_cwd.as_deref() {
        if !cwd.is_dir() {
            return Err(anyhow!(
                "working directory does not exist: {}",
                cwd.display()
            ));
        }
        cmd.cwd(cwd);
    }
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| anyhow!("spawn shell {shell:?} failed: {e}"))?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| anyhow!("take_writer failed: {e}"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| anyhow!("try_clone_reader failed: {e}"))?;

    let id = Uuid::new_v4();
    let scrollback = Arc::new(Mutex::new(VecDeque::with_capacity(SCROLLBACK_BYTES)));

    let scrollback_clone = scrollback.clone();
    let events_clone = events.clone();
    thread::Builder::new()
        .name(format!("pty-reader-{id}"))
        .spawn(move || {
            let mut buf = vec![0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = &buf[..n];
                        // Detect activity on the raw bytes before base64 encoding.
                        // This is the only backend spot that sees every Session's
                        // output regardless of attach, so the signal is emitted on
                        // an attach-independent event (see server forward filter).
                        let sig = detect_activity(chunk);
                        {
                            let mut sb = scrollback_clone.lock();
                            sb.extend(chunk.iter().copied());
                            while sb.len() > SCROLLBACK_BYTES {
                                sb.pop_front();
                            }
                        }
                        let encoded = base64::engine::general_purpose::STANDARD.encode(chunk);
                        let _ = events_clone.send(Event::PtyOutput { id, data: encoded });
                        let _ = events_clone.send(Event::SessionActivity { id, bell: sig.bell });
                    }
                    Err(_) => break,
                }
            }
            let status = child.wait().ok().and_then(|s| {
                let code = s.exit_code();
                if code > i32::MAX as u32 {
                    None
                } else {
                    Some(code as i32)
                }
            });
            let _ = events_clone.send(Event::PtyExit { id, status });
        })
        .map_err(|e| anyhow!("failed to spawn reader thread: {e}"))?;

    let info = SessionInfo {
        id,
        name,
        shell,
        cwd: effective_cwd.map(|value| value.to_string_lossy().into_owned()),
        cols,
        rows,
    };
    Ok(Session {
        info,
        master: pair.master,
        writer,
        killer,
        scrollback,
    })
}

pub fn scrollback_snapshot(scrollback: &Arc<Mutex<VecDeque<u8>>>) -> String {
    let sb = scrollback.lock();
    let bytes: Vec<u8> = sb.iter().copied().collect();
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}
