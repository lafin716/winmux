# Spec: M5 — winmuxctl CLI parity (Session scripting)

Status: ready-for-agent
Feature: orca-shell
Depends on: M1–M4 — shipped
See also: `../PRD.md`, `CONTEXT.md`, `docs/adr/0001-terminal-multiplexer-not-ade.md`

## Problem Statement

As a winmux power user I want to drive winmux from the shell — list Sessions, spawn one with a
given shell/cwd, send input to it, resize it, capture its output, and clean up — so I can script
workflows and integrate winmux into other tooling (orca-CLI style). Today `winmuxctl` only exposes
a fraction of what the daemon can already do (`ls`, `new`, `kill`, `rename`, `kill-server`,
`ping`), has no machine-readable output, has no automated tests, and a CLI-created Session doesn't
show up in the GUI Navigator because it lacks the Workspace name prefix.

## Solution

Bring `winmuxctl` to **full parity with the daemon's Session capabilities** and make it
script-friendly:

- Expose every session-scoped daemon Method the CLI is missing: **send input** (`write`),
  **resize** (`resize`), and **capture scrollback** (`dump`).
- Add **JSON output** (`--json`) so scripts can parse results instead of scraping a table.
- Let a CLI-created Session **join a Workspace** via a `-w/--workspace <index>` prefix option, so
  it appears in the GUI Navigator (honoring the `w{index}.{name}` scheme).
- Refactor the command→Method mapping, target resolution, and output formatting into **pure,
  unit-tested functions** — the CLI's first tests.

winmux stays a terminal multiplexer — this scripts Sessions the daemon already owns; it does **not**
add layout/Workspace scripting (that state lives only in the GUI/localStorage — see Out of Scope).

## User Stories

1. As a scripter, I want `winmuxctl ls --json`, so that I can parse the Session list programmatically.
2. As a scripter, I want `winmuxctl write <target> <text>`, so that I can send input to a Session's shell.
3. As a scripter, I want a way to append a newline/Enter when writing (e.g. `--enter`), so that I can submit a command, not just type it.
4. As a scripter, I want `winmuxctl write <target> -` to read the payload from stdin, so that I can pipe data into a Session.
5. As a scripter, I want `winmuxctl resize <target> --cols N --rows M`, so that I can size a Session for a known layout.
6. As a scripter, I want `winmuxctl dump <target>`, so that I can capture a Session's current scrollback to stdout.
7. As a scripter, I want to target a Session by id, id-prefix, or exact name, so that I don't have to always copy the full UUID (parity with today's `kill`/`rename` resolution).
8. As a scripter, I want `winmuxctl new -w <index> -s <name>`, so that the Session is prefixed `w{index}.{name}` and appears in that Workspace's Navigator.
9. As a scripter, I want `winmuxctl new --json` (and other commands) to emit the created Session as JSON, so that I can capture its id.
10. As a scripter, I want a consistent `--json` flag across commands, so that I can script uniformly.
11. As a scripter, I want the human-readable table output to remain the default, so that interactive use is unchanged.
12. As a scripter, I want clear non-zero exit codes and error messages on failure (unknown target, daemon not running), so that scripts can detect errors.
13. As a maintainer, I want the CLI's command→Method mapping, target resolution, and formatting to be unit-tested, so that CLI changes are safe.
14. As a scripter, I want `dump --json` to include the Session info alongside its scrollback text, so that I get context with the capture.

## Implementation Decisions

- **Pure seams (the test seams).** Refactor `winmuxctl.rs` so the daemon-independent logic is
  extracted into pure functions, mirroring the codebase's "thin async wrapper + pure core" pattern:
  - `resolve_target_in(sessions: &[SessionInfo], target: &str) -> Option<Uuid>` — the existing
    resolution logic (UUID parse → exact `name` match → id-prefix match), lifted out of the
    client call so it can be tested against a fixed Session list.
  - `apply_workspace_prefix(name: Option<String>, workspace: Option<u32>) -> Option<String>` —
    produces `w{index}.{name}` when a workspace index is given (honoring the `w{index}.{name}`
    scheme; do not double-prefix). When no workspace is given, the name passes through unchanged.
  - `format_sessions_table(&[SessionInfo]) -> String` and a JSON path (serde) — output formatting
    for `ls`/`dump`, split from `println!`.
  - `encode_write_data(text: &str, enter: bool) -> String` — base64 of the text, appending `\r`
    when `enter` is set (matches how the GUI writes PTY input).
- **New subcommands (clap derive, already in use).** Add to the `Cmd` enum:
  - `Write { target, data: Option<String> (positional; `-` = read stdin), enter: bool (--enter) }`
    → `Method::WriteSession { id, data }` with `data = encode_write_data(...)`.
  - `Resize { target, cols: u16 (--cols), rows: u16 (--rows) }` → `Method::ResizeSession`.
  - `Dump { target }` → `Method::AttachSession { id }`, then print the base64-decoded
    `AttachResult.scrollback` (and, with `--json`, the `info` too); best-effort
    `Method::DetachSession` before exit.
  - `new` gains `-w/--workspace <index>` applying `apply_workspace_prefix`.
- **Global `--json` flag.** Add a top-level `--json` option to `Cli`; each command's output path
  branches to serde JSON when set, else the existing human format. `ls --json` → `Vec<SessionInfo>`
  as JSON; `new --json` → the created `SessionInfo`; action commands → a small JSON status object.
- **Daemon unchanged.** All new commands map onto **existing** `Method`s (`WriteSession`,
  `ResizeSession`, `AttachSession`, `DetachSession`); no protocol or daemon changes. Connection
  stays `DaemonClient::connect_or_spawn()` → `client.request(...)`.
- **Exit codes.** Non-zero exit on error (unknown target, daemon errors), with the message on
  stderr — preserve today's `anyhow`-based error propagation from `main`.
- **ADR-0001 compliance.** Scripts Sessions only. No task/agent orchestration, no source control.

## Testing Decisions

- **CLI's first cargo tests**, in a `#[cfg(test)]` module in `winmuxctl.rs`, following the
  `protocol.rs`/`commands.rs` test style (pure functions, no live daemon):
  - `resolve_target_in` — resolves by full UUID; by exact name; by id-prefix; returns `None` on no
    match; disambiguates name vs id-prefix as today.
  - `apply_workspace_prefix` — prefixes `w{index}.name` when given an index; passes through with no
    index; does not double-prefix an already-prefixed name.
  - `encode_write_data` — base64 round-trips the text; `--enter` appends `\r` before encoding.
  - `format_sessions_table` — stable columns for a known Session list; `(no sessions)` when empty.
  - clap parsing — `Cli::try_parse_from([...])` accepts the new subcommands/flags with expected
    fields (a couple of representative cases).
- **Prior art:** `protocol.rs`'s `#[cfg(test)] mod tests` (serde round-trips) and `commands.rs`'s
  pure-core test modules.
- **Out of scope for automated tests:** anything requiring a live daemon (actual spawn/write/
  resize/attach round-trips) — covered by manual verification.

## Out of Scope

- **layout / split / Workspace scripting** — deferred (call it M5.5). The daemon holds no
  layout/split/Workspace state; it lives entirely in the GUI + `localStorage`
  (`winmux:workspaces:v1`). Scripting it would require either the daemon to own that state (a large
  refactor) or an IPC bridge exposing the running GUI's state to the CLI — a new subsystem beyond
  this milestone. `-w/--workspace` here only sets the **name prefix** so a CLI Session appears in a
  Workspace; it does not create/switch/arrange Workspaces or Panes.
- Interactive attach/streaming (a live `attach` that mirrors output continuously) — `dump` is a
  one-shot scrollback capture. A streaming mode can come later.
- New daemon Methods or protocol changes.
- Shell-completion scripts, man pages, config files.

## Further Notes

- Vocabulary follows `CONTEXT.md`. Key fact: the daemon is Session-only; `winmuxctl` talks to it
  via `DaemonClient` over the named pipe. The `w{index}.{name}` scheme is a **frontend** convention
  the daemon stores opaquely (AGENTS.md anti-pattern: don't break it) — the `-w` option lets the
  CLI produce conformant names.
- Manual verification: with the daemon running, `winmuxctl new -w 1 -s dev --json` (capture id),
  `winmuxctl ls --json`, `winmuxctl write dev "echo hi" --enter`, `winmuxctl dump dev`,
  `winmuxctl resize dev --cols 100 --rows 40`, `winmuxctl kill dev`; confirm a `-w 1` Session
  appears in Workspace 1's Navigator in the GUI.
