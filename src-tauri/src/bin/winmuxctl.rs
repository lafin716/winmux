use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use winmux_lib::ipc::client::DaemonClient;
use winmux_lib::ipc::protocol::Method;
use winmux_lib::pty::SessionInfo;

#[derive(Parser)]
#[command(name = "winmuxctl", about = "Control the winmux daemon", version)]
struct Cli {
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
    let client = DaemonClient::connect_or_spawn().await?;
    match cli.cmd {
        Cmd::Ls => {
            let sessions: Vec<SessionInfo> = client.request(Method::ListSessions).await?;
            if sessions.is_empty() {
                println!("(no sessions)");
            } else {
                println!("{:<8}  {:<24}  {:<20}  {}", "ID", "NAME", "SHELL", "SIZE");
                for s in sessions {
                    let id_short = s.id.to_string().chars().take(8).collect::<String>();
                    println!(
                        "{:<8}  {:<24}  {:<20}  {}x{}",
                        id_short, s.name, s.shell, s.cols, s.rows
                    );
                }
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
            println!("created {} ({})", info.name, info.id);
        }
        Cmd::Kill { target } => {
            let id = resolve_target(&client, &target).await?;
            client.request_raw(Method::KillSession { id }).await?;
            println!("killed {id}");
        }
        Cmd::Rename { target, name } => {
            let id = resolve_target(&client, &target).await?;
            client
                .request_raw(Method::RenameSession {
                    id,
                    name: name.clone(),
                })
                .await?;
            println!("renamed {id} -> {name}");
        }
        Cmd::KillServer => {
            let _ = client.request_raw(Method::KillServer).await;
            println!("server killed");
        }
        Cmd::Ping => {
            let _: serde_json::Value = client.request(Method::Ping).await?;
            println!("pong");
        }
    }
    Ok(())
}

async fn resolve_target(client: &DaemonClient, target: &str) -> Result<uuid::Uuid> {
    if let Ok(id) = uuid::Uuid::parse_str(target) {
        return Ok(id);
    }
    let sessions: Vec<SessionInfo> = client.request(Method::ListSessions).await?;
    for s in &sessions {
        if s.name == target {
            return Ok(s.id);
        }
    }
    for s in &sessions {
        if s.id.to_string().starts_with(target) {
            return Ok(s.id);
        }
    }
    Err(anyhow!("no session matching {target}"))
}
