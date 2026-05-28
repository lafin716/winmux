# BACKEND KNOWLEDGE BASE

**Path:** `src-tauri/`
**Stack:** Rust, Tauri v2, tokio, portable-pty

## OVERVIEW
Rust workspace containing the Tauri desktop app, a headless daemon (`winmuxd`), and a CLI tool (`winmuxctl`). The daemon owns PTY sessions and communicates with the GUI over named pipes.

## STRUCTURE
```
src-tauri/
├── Cargo.toml            # Three bins: winmux, winmuxd, winmuxctl
├── tauri.conf.json       # Window config, build hooks
├── build.rs              # Tauri build script
├── src/
│   ├── main.rs           # Thin wrapper → lib::run()
│   ├── lib.rs            # Tauri Builder setup, event forwarding
│   ├── commands.rs       # Tauri invoke handlers
│   ├── tray.rs           # System tray icon/menu
│   ├── bin/
│   │   ├── winmuxd.rs    # Daemon entry point
│   │   └── winmuxctl.rs  # CLI entry point
│   ├── daemon/
│   │   └── mod.rs        # Daemon bootstrap + logging
│   ├── ipc/
│   │   ├── mod.rs        # Named pipe helpers (read_frame, write_frame)
│   │   ├── client.rs     # DaemonClient (GUI side)
│   │   ├── server.rs     # Daemon server loop + request dispatch
│   │   └── protocol.rs   # Request/response/event types
│   └── pty/
│       ├── mod.rs        # SessionInfo, spawn_session, scrollback
│       └── manager.rs    # SessionManager (list, create, kill, resize)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add Tauri command | `src/commands.rs` |
| Change IPC protocol | `src/ipc/protocol.rs` |
| Change client logic | `src/ipc/client.rs` |
| Change server dispatch | `src/ipc/server.rs` |
| Change PTY spawn | `src/pty/mod.rs` |
| Change session mgmt | `src/pty/manager.rs` |
| Change tray behavior | `src/tray.rs` |
| Change daemon startup | `src/daemon/mod.rs` |

## CONVENTIONS
- `lib.rs` sets up tokio runtime and Tauri Builder; holds `DaemonClient` and runtime in managed state
- All Tauri commands are async and take `State<'_, Arc<DaemonClient>>`
- Errors from daemon are mapped to `String` for Tauri invoke responses
- PTY reader runs in a dedicated std thread (not tokio) because `portable_pty` is blocking
- Scrollback is a `VecDeque<u8>` capped at 1MB, snapshotted base64 on attach

## ANTI-PATTERNS
- Do NOT remove `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` — prevents console window in release
- Do NOT spawn PTY I/O on tokio tasks — use std threads
- Do NOT send raw bytes over Tauri events — base64 encode (existing pattern in `lib.rs` emitter)
- Do NOT break the frame protocol (4-byte LE length prefix) — both client and server depend on it
- Do NOT forget to call `api.prevent_close()` on main window `CloseRequested` — app lives in tray
