# Tickets: orca-shell M2 (Quick Open)

Vertical slices for M2 of the orca-shell effort — a global fuzzy finder (Ctrl+P) over
Workspaces, Sessions, files, and saved Commands. Source spec:
`.scratch/orca-shell/issues/02-orca-quick-open-m2.md`. Vocabulary follows `CONTEXT.md` (note the
Palette vs Quick Open distinction); the "terminal multiplexer, not agent ADE" guardrail is
`docs/adr/0001-terminal-multiplexer-not-ade.md`.

Work the **frontier**: any ticket whose blockers are all done. Dependency shape: Ticket 1 →
Ticket 2 (linear). Clear context between tickets.

## Quick Open overlay + fuzzy seam (in-memory sources)

**What to build:** Pressing Ctrl+P opens a centered, keyboard-first Quick Open overlay. Typing
fuzzy-filters a ranked list across three in-memory sources — Workspaces, active-Workspace
Sessions, and saved Palette Commands — each result tagged with a kind icon. ↑/↓ moves the
selection, Enter acts (switch Workspace / focus Session / run Command in the focused Session),
Escape dismisses. An empty query shows Workspaces + Sessions as a useful default. This is the
tracer bullet: a fully working global finder with no backend, plus the project's second pure
test seam.

**Blocked by:** None — can start immediately (M1 is shipped).

- [ ] A new global action `view.quickOpen` (default Ctrl+P, reconfigurable) opens the overlay via the existing global-shortcut path.
- [ ] The overlay is a root-level sibling in `App.vue`, centered and above the rest of the UI, with its text field auto-focused on open.
- [ ] Typing fuzzy-filters a single ranked list across Workspaces, active-Workspace Sessions, and saved Palette Commands.
- [ ] Each result shows an icon indicating its kind; Sessions display their `displayName` (no `w{index}.` prefix).
- [ ] ↑/↓ move the selection, Enter acts on the highlighted result, Escape closes, and acting closes the overlay.
- [ ] Picking a Workspace switches the active Workspace; picking a Session focuses its Pane and activates its tab; picking a Command runs it in the focused Session (append `\r` when `autoRun`); with no focused Session, acting on a Command is a no-op.
- [ ] An empty query shows Workspaces + active-Workspace Sessions (no files, since there is no file source yet); ranking sorts prefix/word-boundary/contiguous matches above scattered ones; matching is case-insensitive; results are capped per kind.
- [ ] The headless ranking module (`quick-open.ts`) has passing Vitest tests for: subsequence matching, case-insensitivity, ranking order, the empty-query rule, the per-kind cap, no-match → empty, and kind tagging.

## File source (recursive index + backend)

**What to build:** Quick Open gains a fourth source — files under the active Workspace's Explorer
root. A new backend command returns a bounded, flat list of files under a root (skipping
`node_modules`/`.git`/`target`/`dist`/dotfile dirs, not following symlinks, capped in count),
which the frontend fetches when Quick Open opens and feeds into the ranking module. Files appear
only once the user types (never on an empty query), display a root-relative path, and open as a
`FileViewer` tab when picked.

**Blocked by:** Quick Open overlay + fuzzy seam (in-memory sources).

- [ ] A new Tauri command returns a bounded, flat list of files under a given root, skipping the fixed heavy/irrelevant directory set and not following symlinks, each entry carrying an absolute path and a root-relative display path.
- [ ] The command is async and delegates to a synchronous, unit-testable core (mirroring M1's `read_directory`); the bridge (`tauri.ts`) exposes it with typed results.
- [ ] Quick Open fetches the file index for the active Workspace's resolved Explorer root and includes files in the ranked list, tagged as the File kind with a root-relative display path.
- [ ] Files appear only when the query is non-empty; picking a file opens it as a `FileViewer` tab via `useResources.openFile`.
- [ ] The synchronous file-walk core has passing cargo tests for: honoring the skip-list, respecting the total cap, returning root-relative display paths, and not following symlinks.
