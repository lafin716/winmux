// Pure resolution of the folder the right Explorer tree is rooted at.
//
// The Explorer is rooted at a pinned per-Workspace root. When none is pinned it
// falls back to the Workspace's configured default working directory, and — on
// first open, before either exists — to the focused Session's tracked cwd. Once
// a root is established it stays fixed as the user cd's; only "sync to current
// terminal" re-roots (and pins) it. This module has no Vue/Tauri dependency so
// it can be unit-tested directly (the pre-agreed test seam).

export interface ExplorerRootInputs {
  /** The Workspace's pinned Explorer root, if one has been set. */
  pinnedRoot?: string | null;
  /** The Workspace's configured default working directory. */
  defaultCwd?: string | null;
  /** The focused Session's tracked working directory (OSC-7). */
  focusedCwd?: string | null;
}

/** Trim to a non-empty path, or `undefined` when blank/absent. */
function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the folder the Explorer should be rooted at, in priority order:
 *   1. the Workspace's pinned root (wins; never re-roots on cd);
 *   2. else the Workspace's configured `defaultCwd`;
 *   3. else, on first open, the focused Session's cwd.
 * Returns `undefined` when nothing is known yet (nothing to show).
 */
export function resolveExplorerRoot(inputs: ExplorerRootInputs): string | undefined {
  return clean(inputs.pinnedRoot) ?? clean(inputs.defaultCwd) ?? clean(inputs.focusedCwd);
}

/**
 * The new pinned root when the user hits "sync to current terminal": the
 * focused Session's cwd, or `undefined` when there is no focused cwd (the caller
 * keeps the existing pinned root in that case).
 */
export function syncExplorerRoot(focusedCwd?: string | null): string | undefined {
  return clean(focusedCwd);
}
