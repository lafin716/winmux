use parking_lot::Mutex;
use std::collections::HashMap;
use uuid::Uuid;

use super::{Session, SessionInfo};

pub struct SessionManager {
    pub sessions: Mutex<HashMap<Uuid, Session>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn kill_all(&self) {
        let mut map = self.sessions.lock();
        for (_, session) in map.iter_mut() {
            let _ = session.killer.kill();
        }
        map.clear();
    }

    pub fn list(&self) -> Vec<SessionInfo> {
        self.sessions
            .lock()
            .values()
            .map(|s| s.info.clone())
            .collect()
    }

    pub fn next_default_name(&self) -> String {
        let n = self.sessions.lock().len() + 1;
        format!("session-{n}")
    }

    pub fn resolve_target(&self, target: &str) -> Option<Uuid> {
        let map = self.sessions.lock();
        for (id, s) in map.iter() {
            if s.info.name == target {
                return Some(*id);
            }
        }
        for (id, _) in map.iter() {
            if id.to_string().starts_with(target) {
                return Some(*id);
            }
        }
        None
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
