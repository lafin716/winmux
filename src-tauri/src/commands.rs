use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::ipc::client::DaemonClient;
use crate::ipc::protocol::{AttachResult, Method};
use crate::pty::SessionInfo;

type ClientState<'a> = State<'a, Arc<DaemonClient>>;

#[tauri::command]
pub async fn create_session(
    client: ClientState<'_>,
    name: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<SessionInfo, String> {
    let cols = cols.unwrap_or(120);
    let rows = rows.unwrap_or(30);
    client
        .request(Method::CreateSession { name, shell, cols, rows })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(client: ClientState<'_>) -> Result<Vec<SessionInfo>, String> {
    client
        .request(Method::ListSessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_session(client: ClientState<'_>, id: Uuid) -> Result<(), String> {
    client
        .request_raw(Method::KillSession { id })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_session(
    client: ClientState<'_>,
    id: Uuid,
    data: String,
) -> Result<(), String> {
    client
        .request_raw(Method::WriteSession { id, data })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_session(
    client: ClientState<'_>,
    id: Uuid,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    client
        .request_raw(Method::ResizeSession { id, cols, rows })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn attach_session(client: ClientState<'_>, id: Uuid) -> Result<String, String> {
    let result: AttachResult = client
        .request(Method::AttachSession { id })
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.scrollback)
}

#[tauri::command]
pub async fn rename_session(
    client: ClientState<'_>,
    id: Uuid,
    name: String,
) -> Result<(), String> {
    client
        .request_raw(Method::RenameSession { id, name })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
