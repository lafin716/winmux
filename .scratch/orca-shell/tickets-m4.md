# Tickets: orca-shell M4 (Session activity notifications)

Vertical slices for M4 — per-Session **bell** and **unfocused-output** detection, surfaced as
badges in the Navigator (and optionally the StatusBar). Source spec:
`.scratch/orca-shell/issues/04-orca-session-activity-m4.md`. Vocabulary follows `CONTEXT.md`; the
"terminal multiplexer, not agent ADE" guardrail is `docs/adr/0001-terminal-multiplexer-not-ade.md`.
"Long-command-finish" is explicitly deferred to M4.5 (needs OSC 133 infra that does not exist).

Work the **frontier**: Ticket 1 → Ticket 2 (linear). Clear context between tickets.

## Activity signal pipeline (daemon → app → session state)

**What to build:** The daemon detects, for every Session's output (attached or not), whether the
chunk carried a real bell and that output occurred, and emits a lightweight per-Session activity
event that reaches the app regardless of attach. The app reduces these events into transient
per-Session activity state, treating the focused Session as already-seen, and clears a Session's
state when it becomes focused. This is the tracer bullet: activity state exists and updates
correctly end-to-end, verified by tests (badges arrive in Ticket 2).

**Blocked by:** None — can start immediately.

- [ ] A pure `detect_activity(chunk)` core returns `output`/`bell`, where a BEL that terminates an `ESC ]…` OSC sequence is not counted as a bell; it has passing cargo tests (plain bell, OSC-terminator BEL excluded, ordinary output, empty chunk).
- [ ] A new `Event::SessionActivity { id, bell }` is emitted from the daemon read thread and forwarded to the app even for **unattached** Sessions (via the attach-independent forward branch).
- [ ] The app re-emits it as a Tauri `session-activity` event and the Tauri bridge exposes an `onSessionActivity` listener.
- [ ] A pure `session-activity.ts` reducer folds an event into per-Session state given the focused Session (focused Session raises no badge; `bell` OR-accumulates) and supports clear-on-focus; it has passing Vitest tests.
- [ ] `useSessions` holds the transient activity map (mirroring the `currentCwds` pattern), fed by the listener and cleared when a Session becomes focused.

## Navigator + StatusBar badges

**What to build:** The Navigator shows a badge next to each Session that has unseen activity — a
bell glyph for a bell, a dot for plain output — and the StatusBar's Session strip optionally shows
the same. Focusing a Session clears its badge. Switching Workspaces keeps each Session's badge
correct.

**Blocked by:** Activity signal pipeline (daemon → app → session state).

- [ ] `navigator.ts` carries per-Session activity flags and `buildNavigatorTree` marks the right Session nodes; `navigator.test.ts` covers the flagging.
- [ ] `SideBar.vue` renders a bell/dot badge next to the Session name (bell takes precedence); glyphs added to `offline-icons.ts` as needed.
- [ ] The focused Session shows no badge, and focusing a badged Session clears it.
- [ ] `StatusBar.vue`'s Session strip optionally shows the same badge for the active Workspace's Sessions.
