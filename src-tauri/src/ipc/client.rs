use anyhow::{anyhow, bail, Result};
use serde::de::DeserializeOwned;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::sync::{broadcast, oneshot, Mutex as AsyncMutex};
use tokio::time::sleep;

use super::protocol::{Event, Method, Request, ServerMsg};
use super::{pipe_name, read_frame, write_frame};

type Pending = Arc<AsyncMutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value>>>>>;

pub struct DaemonClient {
    writer: AsyncMutex<tokio::io::WriteHalf<NamedPipeClient>>,
    pending: Pending,
    events: broadcast::Sender<Event>,
    next_id: AtomicU64,
}

impl DaemonClient {
    pub async fn connect_or_spawn() -> Result<Arc<Self>> {
        let name = pipe_name();
        let mut spawned = false;
        for attempt in 0..50 {
            match ClientOptions::new().open(&name) {
                Ok(client) => return Self::from_pipe(client).await,
                Err(_) => {
                    if !spawned {
                        spawn_daemon_detached()?;
                        spawned = true;
                    }
                    if attempt == 49 {
                        bail!("daemon unreachable at {name}");
                    }
                    sleep(Duration::from_millis(100)).await;
                }
            }
        }
        bail!("daemon unreachable at {name}")
    }

    pub async fn connect_existing() -> Result<Arc<Self>> {
        let name = pipe_name();
        let client = ClientOptions::new()
            .open(&name)
            .map_err(|e| anyhow!("daemon not running at {name}: {e}"))?;
        Self::from_pipe(client).await
    }

    async fn from_pipe(pipe: NamedPipeClient) -> Result<Arc<Self>> {
        let (read_half, write_half) = tokio::io::split(pipe);
        let (events_tx, _) = broadcast::channel(1024);
        let pending: Pending = Arc::new(AsyncMutex::new(HashMap::new()));

        let client = Arc::new(Self {
            writer: AsyncMutex::new(write_half),
            pending: pending.clone(),
            events: events_tx.clone(),
            next_id: AtomicU64::new(1),
        });

        let pending_bg = pending.clone();
        tokio::spawn(async move {
            let mut reader = read_half;
            loop {
                let bytes = match read_frame(&mut reader).await {
                    Ok(b) => b,
                    Err(_) => break,
                };
                let msg: ServerMsg = match serde_json::from_slice(&bytes) {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                match msg {
                    ServerMsg::Response { id, result } => {
                        if let Some(tx) = pending_bg.lock().await.remove(&id) {
                            let _ = tx.send(Ok(result));
                        }
                    }
                    ServerMsg::Error { id, message } => {
                        if let Some(tx) = pending_bg.lock().await.remove(&id) {
                            let _ = tx.send(Err(anyhow!(message)));
                        }
                    }
                    ServerMsg::Event(ev) => {
                        let _ = events_tx.send(ev);
                    }
                }
            }
            let mut p = pending_bg.lock().await;
            for (_, tx) in p.drain() {
                let _ = tx.send(Err(anyhow!("daemon disconnected")));
            }
        });

        Ok(client)
    }

    pub async fn request_raw(&self, method: Method) -> Result<serde_json::Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = Request { id, method };
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        let bytes = serde_json::to_vec(&req)?;
        {
            let mut w = self.writer.lock().await;
            write_frame(&mut *w, &bytes).await?;
        }
        rx.await.map_err(|_| anyhow!("response channel closed"))?
    }

    pub async fn request<T: DeserializeOwned>(&self, method: Method) -> Result<T> {
        let value = self.request_raw(method).await?;
        Ok(serde_json::from_value(value)?)
    }

    pub fn events(&self) -> broadcast::Receiver<Event> {
        self.events.subscribe()
    }
}

fn spawn_daemon_detached() -> Result<()> {
    let (exe, arg) = daemon_command()?;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = std::process::Command::new(&exe);
        if let Some(arg) = arg {
            command.arg(arg);
        }
        command
            .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| anyhow!("failed to spawn daemon: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        let mut command = std::process::Command::new(&exe);
        if let Some(arg) = arg {
            command.arg(arg);
        }
        command
            .spawn()
            .map_err(|e| anyhow!("failed to spawn daemon: {e}"))?;
    }
    Ok(())
}

fn daemon_command() -> Result<(PathBuf, Option<&'static str>)> {
    let current = std::env::current_exe()?;
    let dir = current
        .parent()
        .ok_or_else(|| anyhow!("current exe has no parent dir"))?;
    let name = if cfg!(windows) {
        "winmuxd.exe"
    } else {
        "winmuxd"
    };
    let standalone_daemon = dir.join(name);

    if standalone_daemon.exists() {
        return Ok((standalone_daemon, None));
    }

    let current_name = current
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if current_name.eq_ignore_ascii_case("winmux") {
        return Ok((current, Some(crate::DAEMON_ARG)));
    }

    bail!(
        "winmuxd executable not found at {}",
        standalone_daemon.display()
    )
}
