use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::pty::SessionInfo;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Request {
    #[serde(rename = "req_id")]
    pub id: u64,
    #[serde(flatten)]
    pub method: Method,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum Method {
    CreateSession {
        name: Option<String>,
        shell: Option<String>,
        #[serde(default)]
        shell_args: Vec<String>,
        #[serde(default)]
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    },
    ListSessions,
    KillSession {
        id: Uuid,
    },
    WriteSession {
        id: Uuid,
        data: String,
    },
    ResizeSession {
        id: Uuid,
        cols: u16,
        rows: u16,
    },
    AttachSession {
        id: Uuid,
    },
    DetachSession {
        id: Uuid,
    },
    RenameSession {
        id: Uuid,
        name: String,
    },
    KillServer,
    Ping,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ServerMsg {
    Response { id: u64, result: serde_json::Value },
    Error { id: u64, message: String },
    Event(Event),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    PtyOutput { id: Uuid, data: String },
    PtyExit { id: Uuid, status: Option<i32> },
    SessionAdded { info: SessionInfo },
    SessionRemoved { id: Uuid },
    SessionRenamed { id: Uuid, name: String },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AttachResult {
    pub info: SessionInfo,
    pub scrollback: String,
}

#[cfg(test)]
mod tests {
    use super::{Method, Request};

    #[test]
    fn create_session_defaults_missing_shell_args() {
        let request: Request = serde_json::from_value(serde_json::json!({
            "req_id": 1,
            "method": "create_session",
            "name": null,
            "shell": "powershell.exe",
            "cwd": null,
            "cols": 120,
            "rows": 30
        }))
        .expect("request should deserialize");

        match request.method {
            Method::CreateSession { shell_args, .. } => assert!(shell_args.is_empty()),
            _ => panic!("unexpected method"),
        }
    }

    #[test]
    fn create_session_preserves_shell_args() {
        let request = Request {
            id: 1,
            method: Method::CreateSession {
                name: None,
                shell: Some("wsl.exe".to_string()),
                shell_args: vec!["-d".to_string(), "Ubuntu".to_string()],
                cwd: None,
                cols: 120,
                rows: 30,
            },
        };
        let value = serde_json::to_value(request).expect("request should serialize");
        assert_eq!(value["shell_args"], serde_json::json!(["-d", "Ubuntu"]));
    }
}
