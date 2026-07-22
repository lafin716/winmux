# PRD: orca-shell — benchmark orca's layout & features onto winmux

Status: needs-triage
Owner: jupark

## Context

We benchmarked [orca](https://github.com/stablyai/orca), an AI agent development environment, to improve winmux's UI. winmux **remains a terminal multiplexer** — we adopt orca's *visual shell* (3-column collapsible IDE layout) but reject its agent-orchestration purpose. See `docs/adr/0001-terminal-multiplexer-not-ade.md` and the glossary in `CONTEXT.md`.

winmux already owns most of orca's shell: the center pane tree (recursive splits, tabs, drag-rearrange, quadrant splits, mixed Terminal/`FileViewer`/`BrowserView` tabs, `MAX_PANES=16`), a collapsible left `SideBar`, a bottom `StatusBar`, a per-terminal Palette, prefix keybindings, and a `winmuxctl` CLI. This effort adds the two side panels' orca behavior and a curated set of terminal-relevant features.

## Non-goals (dropped from orca)

Mobile Companion, Parallel Worktrees, Design Mode, GitHub & Linear, Annotate AI Diffs, Account/Usage Tracking, Computer Use, SSH/remote sessions. All presuppose an agent runner winmux will not become.

---

## M1 — The orca shell (layout "as-is")

One cohesive milestone delivering the visible 3-column layout.

**Left panel — evolve `SideBar` into a Workspace→Session Navigator**
- Expanded mode lists Workspaces with their open Sessions nested (click-to-focus). Reuse `useWorkspaces` (workspaces + active), `useSessions` (`workspaceSessions`, `focusedSession`, `displayName`), `useFocus` (`setFocusedLeaf`) and `useLayout.findLeafBySession` to focus/reveal.
- Compact 56px icon-rail becomes the "collapsed-but-visible" state. Replace the current 3-mode cycle (`usePrefs.cycleSidebarMode`) with orca-style **show/hide toggle + drag-resize** (see mechanics below); migrate `Prefs.sidebarMode` → a `leftPanel` state.

**Right panel — new file Explorer**
- New component (e.g. `Explorer.vue`) behind an orca-style icon strip (Files only now; leave slots for search/git later).
- File tree rooted at a **pinned per-workspace root**, defaulting to `WorkspaceSettings.defaultCwd` (or the focused Session's cwd on first open). A **"sync to current terminal cwd"** button re-roots on demand (cwd already tracked via OSC-7 in `Terminal.vue`/`useSessions`).
- Click a file → open a `FileViewer` tab via `useResources.openFile` (existing). Directory reads via a Tauri command (add to `src-tauri/src/commands.rs` if none exists).
- Persist the per-workspace pinned root (extend `WorkspaceSettings`, saved through `useWorkspaces` → `winmux:workspaces:v1`).

**Panel mechanics (both sides)**
- Show/hide toggle + free **drag-resize** of each panel's width. Add a between-region splitter with drag logic modeled on `SplitContainer.vue:onSplitterMouseDown` (currently only pane-splitters exist).
- **Top-bar corner toggle buttons** in `MenuBar.vue` (left + right), mirroring orca.
- Keybindings via the `ACTIONS` registry (`src/lib/keybindings.ts`): `view.toggleLeftPanel` (Ctrl+Shift+B, repurposed) and new `view.toggleRightPanel`.
- Persist panel open/closed + widths in `Prefs` (`winmux:prefs:v1`, `usePrefs`).

**Shell wiring**
- Add the right panel as a new child of `.main` in `App.vue` (today: `SideBar` + `.content`); insert region splitters around `.content`.

**M1 done when:** both panels toggle + drag-resize with persisted state; left shows the workspace→session navigator; right shows a working, click-to-open file explorer rooted per-workspace with a sync button.

---

## M2 — Quick Open

Global fuzzy finder (new component + composable, e.g. `useQuickOpen`) over: Workspaces, Sessions (`useSessions`), files under the Explorer root, and Palette commands (`usePalette`). Selecting navigates/focuses (Workspace/Session) or opens (file) or runs (command). New global keybinding (e.g. Ctrl+P). Distinct from the per-terminal Palette — see `CONTEXT.md`.

## M3 — File power

Extend `FileViewer.vue`: render Markdown and preview PDF (in addition to existing text/image). Make the Monaco editor **editable with save** (new Tauri write command). Drag a file from the Explorer into a Terminal to insert its path (extend `Terminal.vue` drop handling + `useDragState`).

## M4 — Session activity notifications

Detect per-Session bell / new-output-while-unfocused / long-command-finish (daemon/PTY layer in `src-tauri/src/pty/` + events over the existing base64 Tauri event channel). Surface as status badges on Sessions in the M1 Navigator and optionally the `StatusBar`.

## M5 — winmuxctl CLI parity

Expand `src-tauri/src/bin/winmuxctl` to script Sessions/splits/layout/Workspaces, orca-CLI-style. Drives the same daemon IPC (`src-tauri/src/ipc/`) the GUI uses.

---

## Verification (M1)

Run `pnpm tauri dev`. Confirm: left panel toggles/resizes and lists workspaces→sessions with click-to-focus; right file explorer opens rooted at the workspace cwd, the sync button re-roots to the focused terminal, clicking a file opens a FileViewer tab; both panels' open state + widths survive an app restart (localStorage). Corner toggle buttons and keybindings (Ctrl+Shift+B / new right-toggle) work.
