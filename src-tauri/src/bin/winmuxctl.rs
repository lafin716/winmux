use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use uuid::Uuid;
use winmux_lib::ipc::client::DaemonClient;
use winmux_lib::ipc::protocol::Method;
use winmux_lib::pty::SessionInfo;

#[derive(Parser)]
#[command(name = "winmuxctl", about = "Control the winmux daemon", version)]
struct Cli {
    /// Emit machine-readable JSON instead of the default human-readable output
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// List sessions
    Ls,
    /// Create a new session
    New {
        /// Session name
        #[arg(short = 's', long)]
        name: Option<String>,
        /// Shell to launch (default: powershell.exe)
        #[arg(long)]
        shell: Option<String>,
        /// Argument passed to the shell (repeatable)
        #[arg(long = "shell-arg")]
        shell_args: Vec<String>,
        /// Working directory for the new session
        #[arg(long)]
        cwd: Option<String>,
        #[arg(long, default_value_t = 120)]
        cols: u16,
        #[arg(long, default_value_t = 30)]
        rows: u16,
    },
    /// Kill a session by id-prefix or name
    Kill { target: String },
    /// Rename a session by id-prefix or name
    Rename { target: String, name: String },
    /// Stop the winmux daemon
    KillServer,
    /// Ping the daemon
    Ping,
}

fn main() {
    let cli = Cli::parse();
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("failed to create runtime: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = rt.block_on(run(cli)) {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

async fn run(cli: Cli) -> Result<()> {
    let json = cli.json;
    let client = DaemonClient::connect_or_spawn().await?;
    match cli.cmd {
        Cmd::Ls => {
            let sessions: Vec<SessionInfo> = client.request(Method::ListSessions).await?;
            if json {
                println!("{}", serde_json::to_string_pretty(&sessions)?);
            } else {
                println!("{}", format_sessions_table(&sessions));
            }
        }
        Cmd::New {
            name,
            shell,
            shell_args,
            cwd,
            cols,
            rows,
        } => {
            let info: SessionInfo = client
                .request(Method::CreateSession {
                    name,
                    shell,
                    shell_args,
                    cwd,
                    cols,
                    rows,
                })
                .await?;
            if json {
                println!("{}", serde_json::to_string_pretty(&info)?);
            } else {
                println!("created {} ({})", info.name, info.id);
            }
        }
        Cmd::Kill { target } => {
            let id = resolve_target(&client, &target).await?;
            client.request_raw(Method::KillSession { id }).await?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "ok": true,
                        "action": "killed",
                        "id": id.to_string(),
                    }))?
                );
            } else {
                println!("killed {id}");
            }
        }
        Cmd::Rename { target, name } => {
            let id = resolve_target(&client, &target).await?;
            client
                .request_raw(Method::RenameSession {
                    id,
                    name: name.clone(),
                })
                .await?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "ok": true,
                        "action": "renamed",
                        "id": id.to_string(),
                        "name": name,
                    }))?
                );
            } else {
                println!("renamed {id} -> {name}");
            }
        }
        Cmd::KillServer => {
            let _ = client.request_raw(Method::KillServer).await;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "ok": true,
                        "action": "kill_server",
                    }))?
                );
            } else {
                println!("server killed");
            }
        }
        Cmd::Ping => {
            let _: serde_json::Value = client.request(Method::Ping).await?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "ok": true,
                        "action": "ping",
                        "result": "pong",
                    }))?
                );
            } else {
                println!("pong");
            }
        }
    }
    Ok(())
}

/// Resolve a user-supplied target to a session id by asking the daemon for the
/// session list, then delegating the matching to the pure [`resolve_target_in`].
/// A full UUID is honored without a round-trip.
async fn resolve_target(client: &DaemonClient, target: &str) -> Result<Uuid> {
    if let Ok(id) = Uuid::parse_str(target) {
        return Ok(id);
    }
    let sessions: Vec<SessionInfo> = client.request(Method::ListSessions).await?;
    resolve_target_in(&sessions, target).ok_or_else(|| anyhow!("no session matching {target}"))
}

/// Pure target resolution: a full UUID, then an exact `name` match, then an
/// id-prefix match (in that precedence). Returns `None` when nothing matches.
fn resolve_target_in(sessions: &[SessionInfo], target: &str) -> Option<Uuid> {
    if let Ok(id) = Uuid::parse_str(target) {
        return Some(id);
    }
    if let Some(s) = sessions.iter().find(|s| s.name == target) {
        return Some(s.id);
    }
    if let Some(s) = sessions
        .iter()
        .find(|s| s.id.to_string().starts_with(target))
    {
        return Some(s.id);
    }
    None
}

/// Render the session list as the human-readable fixed-width table. Returns
/// `(no sessions)` for an empty list. No trailing newline (callers `println!`).
fn format_sessions_table(sessions: &[SessionInfo]) -> String {
    if sessions.is_empty() {
        return "(no sessions)".to_string();
    }
    let mut lines = Vec::with_capacity(sessions.len() + 1);
    lines.push(format!(
        "{:<8}  {:<24}  {:<20}  {}",
        "ID", "NAME", "SHELL", "SIZE"
    ));
    for s in sessions {
        let id_short = s.id.to_string().chars().take(8).collect::<String>();
        lines.push(format!(
            "{:<8}  {:<24}  {:<20}  {}x{}",
            id_short, s.name, s.shell, s.cols, s.rows
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::{format_sessions_table, resolve_target_in, Cli, Cmd};
    use clap::Parser;
    use uuid::Uuid;
    use winmux_lib::pty::SessionInfo;

    fn session(id: Uuid, name: &str, shell: &str, cols: u16, rows: u16) -> SessionInfo {
        SessionInfo {
            id,
            name: name.to_string(),
            shell: shell.to_string(),
            cwd: None,
            cols,
            rows,
        }
    }

    #[test]
    fn resolve_target_in_matches_full_uuid() {
        let listed = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let sessions = vec![session(listed, "dev", "pwsh", 80, 24)];
        // A well-formed UUID resolves to itself even if absent from the list.
        let absent = Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap();
        assert_eq!(resolve_target_in(&sessions, &absent.to_string()), Some(absent));
        assert_eq!(resolve_target_in(&sessions, &listed.to_string()), Some(listed));
    }

    #[test]
    fn resolve_target_in_matches_exact_name() {
        let id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let sessions = vec![session(id, "dev", "pwsh", 80, 24)];
        assert_eq!(resolve_target_in(&sessions, "dev"), Some(id));
    }

    #[test]
    fn resolve_target_in_matches_id_prefix() {
        let id = Uuid::parse_str("abcdef00-0000-0000-0000-000000000000").unwrap();
        let sessions = vec![session(id, "dev", "pwsh", 80, 24)];
        assert_eq!(resolve_target_in(&sessions, "abcdef00"), Some(id));
    }

    #[test]
    fn resolve_target_in_returns_none_when_no_match() {
        let id = Uuid::parse_str("abcdef00-0000-0000-0000-000000000000").unwrap();
        let sessions = vec![session(id, "dev", "pwsh", 80, 24)];
        assert_eq!(resolve_target_in(&sessions, "nope"), None);
    }

    #[test]
    fn resolve_target_in_prefers_exact_name_over_id_prefix() {
        // "a" is an exact name for one session and an id-prefix for another;
        // the exact-name match must win (mirrors the original ordering).
        let name_id = Uuid::parse_str("dddddddd-dddd-dddd-dddd-dddddddddddd").unwrap();
        let prefix_id = Uuid::parse_str("a0000000-0000-0000-0000-000000000000").unwrap();
        let sessions = vec![
            session(prefix_id, "shell", "pwsh", 80, 24),
            session(name_id, "a", "pwsh", 80, 24),
        ];
        assert_eq!(resolve_target_in(&sessions, "a"), Some(name_id));
    }

    #[test]
    fn format_sessions_table_reports_empty() {
        assert_eq!(format_sessions_table(&[]), "(no sessions)");
    }

    #[test]
    fn format_sessions_table_has_stable_columns() {
        let id = Uuid::parse_str("abcdef01-2345-6789-abcd-ef0123456789").unwrap();
        let sessions = vec![session(id, "dev", "pwsh", 80, 24)];
        let table = format_sessions_table(&sessions);
        let lines: Vec<&str> = table.lines().collect();
        assert_eq!(lines.len(), 2, "header + one row");
        // Header column offsets are fixed.
        assert_eq!(&lines[0][0..2], "ID");
        assert_eq!(&lines[0][10..14], "NAME");
        assert_eq!(&lines[0][36..41], "SHELL");
        assert_eq!(&lines[0][58..62], "SIZE");
        // Row: id truncated to 8 chars, aligned to the same columns, size NxM.
        assert_eq!(&lines[1][0..8], "abcdef01");
        assert_eq!(&lines[1][10..13], "dev");
        assert_eq!(&lines[1][36..40], "pwsh");
        assert!(lines[1].ends_with("80x24"));
    }

    #[test]
    fn parses_ls_with_global_json() {
        let cli = Cli::try_parse_from(["winmuxctl", "ls", "--json"]).unwrap();
        assert!(cli.json);
        assert!(matches!(cli.cmd, Cmd::Ls));
    }

    #[test]
    fn parses_global_json_before_subcommand() {
        let cli = Cli::try_parse_from(["winmuxctl", "--json", "ls"]).unwrap();
        assert!(cli.json);
        assert!(matches!(cli.cmd, Cmd::Ls));
    }

    #[test]
    fn parses_new_with_short_name_and_cols() {
        let cli = Cli::try_parse_from(["winmuxctl", "new", "-s", "dev", "--cols", "100"]).unwrap();
        assert!(!cli.json);
        match cli.cmd {
            Cmd::New {
                name,
                shell,
                shell_args,
                cwd,
                cols,
                rows,
            } => {
                assert_eq!(name.as_deref(), Some("dev"));
                assert_eq!(cols, 100);
                assert_eq!(rows, 30, "rows keeps its default");
                assert!(shell.is_none());
                assert!(shell_args.is_empty());
                assert!(cwd.is_none());
            }
            _ => panic!("expected New"),
        }
    }

    #[test]
    fn parses_kill_target() {
        let cli = Cli::try_parse_from(["winmuxctl", "kill", "abc"]).unwrap();
        match cli.cmd {
            Cmd::Kill { target } => assert_eq!(target, "abc"),
            _ => panic!("expected Kill"),
        }
    }

    #[test]
    fn parses_rename_target_and_name() {
        let cli = Cli::try_parse_from(["winmuxctl", "rename", "abc", "newname"]).unwrap();
        match cli.cmd {
            Cmd::Rename { target, name } => {
                assert_eq!(target, "abc");
                assert_eq!(name, "newname");
            }
            _ => panic!("expected Rename"),
        }
    }
}
