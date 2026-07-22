# Tickets: orca-shell M5 (winmuxctl CLI parity — Session scripting)

Vertical slices for M5 — expand `winmuxctl` to full Session-scripting parity with the daemon,
with JSON output and the CLI's first tests. Source spec:
`.scratch/orca-shell/issues/05-orca-winmuxctl-parity-m5.md`. Vocabulary follows `CONTEXT.md`; the
"terminal multiplexer, not agent ADE" guardrail is `docs/adr/0001-terminal-multiplexer-not-ade.md`.
layout/Workspace scripting is explicitly deferred to M5.5 (daemon has no such state).

Work the **frontier**: Ticket 1 → Ticket 2 (linear). Clear context between tickets.

## Testable CLI core + JSON output

**What to build:** Refactor `winmuxctl` so its daemon-independent logic (target resolution, output
formatting) lives in pure, unit-tested functions, and add a global `--json` flag so the existing
commands (`ls`, `new`, `kill`, `rename`, `ping`, `kill-server`) can emit machine-readable output.
Human-readable output stays the default and unchanged. This is the tracer bullet: the CLI gains
its first tests and a JSON path with no daemon changes.

**Blocked by:** None — can start immediately.

- [ ] `resolve_target_in(sessions, target)` is a pure function (UUID → exact name → id-prefix) with passing cargo tests, and the CLI's target commands use it.
- [ ] `format_sessions_table(sessions)` is a pure formatter (stable columns; `(no sessions)` when empty) with passing cargo tests.
- [ ] A top-level `--json` flag makes `ls` emit `Vec<SessionInfo>` as JSON and `new` emit the created `SessionInfo` as JSON; action commands emit a small JSON status object; without `--json` the current human output is unchanged.
- [ ] The CLI has a `#[cfg(test)]` module (its first tests) covering the pure functions and a couple of `Cli::try_parse_from` parsing cases; `cargo test` passes.
- [ ] No daemon/protocol changes; connection stays `connect_or_spawn` → `request`.

## Expanded session scripting (write / resize / dump / workspace prefix)

**What to build:** Add the missing session-scoped commands so the CLI can drive a Session
end-to-end: send input (`write`, with `--enter` and stdin support), resize (`resize`), and capture
scrollback (`dump`). Add `-w/--workspace <index>` to `new` so a CLI Session gets the `w{index}.`
prefix and shows up in the GUI Navigator. All map onto existing daemon Methods.

**Blocked by:** Testable CLI core + JSON output.

- [ ] `write <target> [data]` sends input to the Session via `WriteSession` (base64), with `--enter` appending `\r` and `data = -` reading stdin; `encode_write_data` is pure and cargo-tested.
- [ ] `resize <target> --cols N --rows M` maps to `ResizeSession`.
- [ ] `dump <target>` attaches, prints the base64-decoded scrollback to stdout (and Session info too under `--json`), and best-effort detaches before exit.
- [ ] `new -w <index> -s <name>` produces a `w{index}.{name}` Session via a pure, cargo-tested `apply_workspace_prefix` (no double-prefix; passes through when no index).
- [ ] New subcommands parse via clap with representative `Cli::try_parse_from` tests; `cargo test` and `cargo check` pass; no daemon/protocol changes.
