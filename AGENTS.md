# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-28
**Commit:** unknown
**Branch:** main

## OVERVIEW
`winmux` is a Windows terminal multiplexer built with Tauri v2 (Rust backend) + Vue 3 (TypeScript frontend). It spawns PTY sessions via a background daemon (`winmuxd`) and renders them with xterm.js inside a draggable/splittable pane layout.

## STRUCTURE
```
.
├── src/              # Vue 3 frontend
├── src-tauri/        # Rust backend + Tauri app
├── public/           # Static assets
├── dist/             # Vite build output
├── package.json      # pnpm, Vue, Vite deps
├── vite.config.ts    # dev server on :3000, ignores src-tauri
└── tsconfig.json     # strict TS, Vue SFCs
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add UI component | `src/components/*.vue` | Vue 3 `<script setup lang="ts">` SFCs |
| Add state logic | `src/composables/*.ts` | Reactive store logic, no Pinia |
| Change layout tree | `src/composables/useLayout.ts` | Leaf/split tree ops, MAX_PANES=16 |
| Change keybindings | `src/lib/keybindings.ts` | ActionDef registry |
| Change Tauri bridge | `src/lib/tauri.ts` | invoke + event listeners |
| Change PTY commands | `src-tauri/src/commands.rs` | Tauri command handlers |
| Change daemon IPC | `src-tauri/src/ipc/` | Named-pipe protocol, client, server |
| Change PTY spawning | `src-tauri/src/pty/` | portable-pty wrapper, scrollback buffer |
| Change tray/menu | `src-tauri/src/tray.rs` | System tray integration |
| Add CLI bin | `src-tauri/src/bin/` | `winmuxd` daemon, `winmuxctl` CLI |

## CONVENTIONS
- **Package manager:** pnpm (lockfile `pnpm-lock.yaml`)
- **Frontend:** Vue 3 SFCs with `<script setup lang="ts">`, no class components
- **State:** Composables (reactive objects) instead of Pinia/Vuex
- **Styling:** Scoped `<style>` in components; global scrollbar theming in `App.vue`
- **Backend:** Rust 2021 edition; tokio multi-thread runtime; anyhow for errors
- **IPC:** Length-prefixed frames over Windows named pipes (`\\.\pipe\winmux-{user}`)
- **Data encoding:** PTY output written base64 over Tauri events
- **TypeScript:** Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **Persistence:** localStorage keys use `winmux:{domain}:v1` format with `{ version: 1, ... }` envelope

## ANTI-PATTERNS (THIS PROJECT)
- Do NOT add more than `MAX_PANES` (16) panes — guarded in `useLayout.ts` and UI alerts
- Do NOT break session naming scheme (`w{workspaceIndex}.{name}`) — daemon expects unique names
- Do NOT make the main window close quit the app — close button hides to system tray
- Do NOT let Vite watch `src-tauri` — explicitly ignored in `vite.config.ts`
- Do NOT use `std::sync::Mutex` in backend — use `parking_lot::Mutex` (existing pattern)

## UNIQUE STYLES
- **Prefix-key system:** Ctrl+B prefix followed by action key (tmux-style), configurable per action
- **Workspace-scoped sessions:** Session names prefixed by workspace index to ensure daemon uniqueness
- **Quadrant splits:** Corner-based 4-way splits (tl/tr/bl/br) create two nested 50/50 splits
- **Drag-and-drop tabs:** Tabs can be moved between leaves or dropped on edge zones to create splits
- **IME composition guard:** Terminal.vue suppresses duplicate onData during Hangul composition

## COMMANDS
```bash
# Frontend dev (Vite on :3000)
pnpm dev

# Full Tauri dev (Vite + Rust)
pnpm tauri dev

# Production build
pnpm build          # Vue build
pnpm tauri build    # Full app bundle
```

## NOTES
- Daemon auto-spawns on first Tauri invoke if not running; logs to `%LOCALAPPDATA%\winmux\logs\winmuxd.log`
- `src-tauri/src/lib.rs` and `src-tauri/src/main.rs` are separate: lib for Tauri app, main is thin wrapper
- `Cargo.toml` defines three binaries: `winmux` (GUI), `winmuxd` (daemon), `winmuxctl` (CLI)
- No test suite exists yet (front or back)
- `.github/workflows` does not exist — CI not configured

## Agent skills

### Issue tracker

Issues and PRDs live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.
