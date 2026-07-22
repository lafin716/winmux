# Spec: M4 — Session activity notifications (bell + unfocused output)

Status: ready-for-agent
Feature: orca-shell
Depends on: M1 (shell/Navigator), M2, M3 — shipped
See also: `../PRD.md`, `CONTEXT.md`, `docs/adr/0001-terminal-multiplexer-not-ade.md`

## Problem Statement

As a winmux user I run many Sessions across Panes and Workspaces, but a Session I'm not looking
at gives me no sign when something happens in it: a program rings the terminal bell, or a
long-running job prints output while I'm focused elsewhere. I have to click around to notice.
There is no at-a-glance indicator in the Navigator (or StatusBar) telling me "this Session did
something while you weren't watching."

## Solution

Detect two per-Session activity signals and surface them as badges on the Session in the M1
Navigator (and, optionally, the StatusBar):

- **Bell** — the Session emitted a terminal bell (0x07) that isn't merely an OSC-sequence
  terminator.
- **Unfocused output** — the Session produced output while it was **not** the focused Session.

Because the daemon only streams a Session's output to the app while that Session is *attached*
(mounted in a visible Pane), the detection is done in the **daemon's read thread** — which sees
every Session's bytes regardless of attach — and delivered to the app as a lightweight per-Session
activity event. The app reduces these into transient per-Session activity state, badges the
Navigator/StatusBar, and clears a Session's badges when it becomes focused. Nothing is persisted;
activity is a live, in-memory signal. winmux stays a terminal multiplexer — this is a passive
awareness indicator, not agent/task tooling (per ADR-0001).

## User Stories

1. As a winmux user, I want a Session that rang the bell to show a bell badge in the Navigator, so that I notice an alert I didn't hear.
2. As a winmux user, I want a Session that produced output while I wasn't focused on it to show an activity badge, so that I know it did something.
3. As a winmux user, I want the focused Session to never show an activity badge, so that the badge means "something happened while you weren't watching."
4. As a winmux user, I want a Session's badges to clear when I focus it, so that badges reflect only unseen activity.
5. As a winmux user, I want activity detected even for Sessions that aren't currently shown in a Pane, so that background Sessions still notify me.
6. As a winmux user, I want the bell badge distinguished from the plain-output badge, so that I can tell an alert from routine output.
7. As a winmux user, I want a prompt-redraw (which some shells emit with a BEL as an OSC terminator) to NOT be counted as a bell, so that my badges aren't noise on every prompt.
8. As a winmux user, I want the badges to appear next to the Session name in the Navigator tree, so that they're where I already look for Sessions.
9. As a winmux user, I want the active Workspace's Session badges reflected in the StatusBar Session strip too (optional surface), so that I can notice activity even with the Navigator collapsed/hidden.
10. As a winmux user, I want activity state to be purely in-memory (not persisted across restart), so that a restart starts clean.
11. As a winmux user, I want the activity signal to be lightweight, so that a high-output Session doesn't bog down the app.
12. As a winmux user, I want switching Workspaces to keep each Session's activity correct, so that badges follow the Sessions, not the view.

## Implementation Decisions

- **Detection in the daemon read thread (pure core).** In the PTY read loop (`pty/mod.rs`), where
  each raw output chunk is produced before base64 encoding, call a new **pure function**
  (e.g. `detect_activity(chunk: &[u8]) -> ChunkSignal { output: bool, bell: bool }`) placed in a
  unit-testable spot (`pty/mod.rs` or a new `pty/activity.rs`). `bell` is true when the chunk
  contains a BEL (0x07) that is **not** acting as an OSC-string terminator (i.e. not the `BEL`
  closing an `ESC ]…` sequence). Cross-chunk OSC spanning may be treated best-effort within a
  chunk. `output` is true when the chunk is non-empty.
- **New daemon event, forwarded regardless of attach.** Add `Event::SessionActivity { id, bell }`
  to the IPC protocol (`ipc/protocol.rs`), emitted by the read thread. In the server's per-client
  forward filter (`ipc/server.rs`), route it through the `_ => true` branch (like
  `SessionAdded/Removed/Renamed`) so it reaches the app even for **unattached** Sessions. Keep the
  event tiny (id + bool); coalesce if reasonable, but per-chunk emission is acceptable for M4.
- **App re-emits as a Tauri event.** In `lib.rs`, map `Event::SessionActivity` to a Tauri event
  (e.g. `"session-activity"`) mirroring the existing `pty-output`/`session-added` re-emit pattern.
  Expose a `onSessionActivity` listener in the Tauri bridge (`tauri.ts`).
- **Frontend reducer (pure seam) + transient state.** Introduce `session-activity.ts`: a pure
  reducer that folds an activity event into per-Session state given the currently focused Session —
  `applyActivity(state, { id, bell }, focusedId) -> nextState` (an event for the focused Session
  does not raise a badge) and `clearActivity(state, id)` (used when a Session gains focus). State
  shape: `Record<sessionId, { output: boolean; bell: boolean }>`. No Vue/DOM/Tauri dependency;
  unit-tested directly. Wire it into `useSessions` as a parallel `reactive<Record<string, …>>`
  map (mirroring the existing `currentCwds` pattern), fed by the `session-activity` listener, and
  cleared when `focusedSession` changes to a Session.
- **Navigator badges.** Extend `navigator.ts` (`NavigatorSessionNode` + `NavigatorInput`) to carry
  per-Session activity flags, and have `buildNavigatorTree` flag each Session node. `SideBar.vue`
  renders a badge next to the Session name — a bell glyph for `bell`, a dot for plain `output`
  (bell takes visual precedence). Add glyphs to `offline-icons.ts` as needed.
- **StatusBar (optional surface).** `StatusBar.vue`'s Session strip may show the same badge for the
  active Workspace's Sessions. Keep it minimal.
- **Clear-on-focus.** When a Session becomes the focused Session, clear its activity entry so its
  badges disappear.
- **ADR-0001 compliance.** This is a passive awareness badge on existing Sessions — no task/agent
  runner, no source control, no account/usage meters.

## Testing Decisions

- **Backend cargo seam:** `detect_activity` — a plain BEL is a bell; a BEL that terminates an
  `ESC ]…` OSC sequence is NOT a bell; a chunk with ordinary bytes is `output:true, bell:false`;
  an empty chunk is `output:false`. Mirror the `commands.rs` `#[cfg(test)]` temp/pure-fn style
  (here purely in-memory byte slices). If a new `Event` variant needs coverage, extend
  `protocol.rs`'s existing `#[cfg(test)] mod tests`.
- **Frontend Vitest seam:** `session-activity.ts` — an event for a non-focused Session sets its
  flags; an event for the focused Session does not; `bell` OR-accumulates with prior state;
  `clearActivity` removes a Session's entry; unknown/edge inputs are safe. Plus the
  `navigator.ts` change: given activity flags, `buildNavigatorTree` marks the right Session nodes
  (extend `navigator.test.ts`).
- **Prior art:** M1–M3 frontend `*.test.ts` seams and the `commands.rs`/`protocol.rs` cargo tests.
- **Out of scope for automated tests:** the real bell ringing, DOM badge rendering, event
  delivery/attach behavior, and focus-driven clearing in the live app — covered by manual
  verification.

## Out of Scope

- **Long-command-finish detection** — deferred to a follow-up (call it M4.5). It requires OSC 133
  shell-integration marks (command start/end) that the codebase does not emit or parse, plus
  daemon-side VT parsing and per-command timing — a substantially larger effort than the two
  signals shipped here. Documented as a known gap.
- Persisted activity/notification history; OS-level (tray/toast) notifications; sound.
- Per-Session activity counts or timestamps (badges are boolean: has-activity / has-bell).
- Coalescing/throttling tuning beyond a reasonable default.
- Milestone M5: `winmuxctl` CLI parity.

## Further Notes

- Vocabulary follows `CONTEXT.md`. Key architectural fact driving the design: the daemon forwards
  `PtyOutput` only to **attached** Sessions, so activity detection must live in the daemon read
  thread and travel on an attach-independent event.
- The powershell prompt integration already emits `ESC ]9;9;<path> BEL` each prompt, so naive
  0x07 scanning would false-positive every prompt — hence the OSC-terminator exclusion in
  `detect_activity`.
- Manual verification (from the PRD): run `pnpm tauri dev`; in an unfocused Session, run something
  that prints output and something that rings the bell (e.g. `printf '\a'`); confirm the Navigator
  shows an activity dot and a bell badge on that Session, the focused Session shows none, and
  focusing the Session clears its badges; confirm a Session not currently in a Pane still flags
  activity.
