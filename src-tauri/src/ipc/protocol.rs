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
