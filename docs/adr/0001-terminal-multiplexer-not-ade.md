# Adopt orca's shell, remain a terminal multiplexer (not an agent ADE)

We benchmarked orca (an AI agent development environment) to improve winmux's UI. We decided to adopt orca's *visual shell* — the 3-column collapsible IDE layout (left Navigator, center pane tree, right Explorer, corner panel toggles, drag-resizable panels) — but to deliberately **not** adopt its purpose as an agent orchestrator. winmux stays a terminal multiplexer.

## Why this is worth recording

The two things are easy to conflate: nearly all of orca's *features* (parallel worktrees, Design Mode, GitHub/Linear, AI-diff annotation, account/usage tracking, computer use, mobile companion) exist to run coding agents in git worktrees. A future contributor looking at the borrowed layout may reasonably assume the agent-orchestration features are also on the roadmap and start building toward an ADE. They are not: those seven features were explicitly evaluated and dropped because they presuppose an agent runner winmux does not have and does not intend to become.

## What we kept vs dropped

- **Kept (shell):** left/right collapsible panels, drag-resize, file Explorer, workspace→session Navigator.
- **Kept (features, later milestones):** Quick Open, rich file previews (Markdown/PDF), editable editor + drag-path, `winmuxctl` CLI parity, session activity/bell notifications — each is meaningful for a terminal multiplexer.
- **Dropped:** Mobile Companion, Parallel Worktrees, Design Mode, GitHub & Linear, Annotate AI Diffs, Account/Usage Tracking, Computer Use, and SSH/remote sessions.

## Consequences

The Shell's panels are reinterpreted for terminal work: the left panel is a Workspace/Session Navigator (not a task/worktree list), and the right panel is a file Explorer (not a source-control/agent-tools column). orca's bottom account-usage meters are omitted; winmux keeps its existing StatusBar.
