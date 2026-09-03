# SDD ledger — plan: docs/superpowers/plans/2026-09-02-agent-session-icons.md

Ruling: Execute in the current Orca-managed workspace — the prescribed workspace helper requires an unavailable Linux runtime, and creating a separate worktree would omit the user's uncommitted UI changes; the cost if wrong is reduced isolation between sequential task agents.

Pre-flight interface scan:

| Tasks | Shared interface/files | Finding |
| --- | --- | --- |
| 1 → 2 | `AgentKind`, `ProcessEntry`, `Session.shell_pid` | Task 1 defines every type consumed by Task 2. |
| 2 → 3 | `SessionInfo.agent`, `SessionAgentChanged` | Task 2 creates the serialized state and event that Task 3 forwards. |
| 3 → 4 | TypeScript `AgentKind`, reactive `SessionInfo.agent` | Task 3 makes the state available to both UI consumers in Task 4. |
| 4 → 5 | Rust/TypeScript tests and UI rendering | Task 5 verifies all prior outputs. |

Task 1 text agrees with its test-first requirements and file list. No pre-flight conflicts found.

Task 1: complete (no commit; current workspace contains user changes, review clean after fix round 1). Ruling: do not apply full-worktree formatting because its failures predate this task in unrelated Rust files; cost if wrong is that unrelated formatting drift remains visible to later verification.

Task 2: complete. Agent transitions are stored by the daemon and emitted only on state changes. Empty daemons skip process snapshots; snapshot task failures preserve the last known state.

Task 3: complete. The App owns and cleans up the Tauri listener. Revisioned event replay prevents list/create responses from overwriting newer agent events, and a successful retry refreshes missed state.

Task 4: complete. One local icon resolver supplies terminal, Claude, and Codex icons to both Navigator rows and terminal tabs.

Task 5 automated verification: complete. Frontend: 11 files / 93 tests passed and production build passed. Rust: 38 library tests plus 23 CLI tests passed. Relevant Rust files pass rustfmt and the full diff passes whitespace checks. Whole-worktree cargo fmt remains blocked only by pre-existing formatting in src-tauri/src/bin/winmuxctl.rs. Live Tauri UI validation was not available in this harness.

Review follow-up: applied legacy IPC compatibility, listener lifecycle/race fixes, wrapper-aware classification with negative tests, idle-scan avoidance, snapshot failure handling, process-tree indexing, and lagged receiver survival. Residual manual risks are WSL-contained agents, same-second newest-agent ties, and a single agent event lost during broadcast lag until the next transition or refresh.
