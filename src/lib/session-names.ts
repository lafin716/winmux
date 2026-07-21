// Pure helpers for the daemon session-naming scheme `w{index}.{name}`: each
// Session's daemon name is prefixed with its Workspace's 1-based index so names
// stay unique across Workspaces. Kept dependency-free (no Vue/Tauri) so both
// `useSessions` and the headless Navigator selector share one home for the
// scheme instead of each re-encoding the regex.

/** Leading `w{index}.` Workspace prefix on a daemon session name. */
const WORKSPACE_PREFIX_RE = /^w(\d+)\./;

/** Strip every leading `w{index}.` prefix to get the un-prefixed display name. */
export function displayName(name: string): string {
  let out = name;
  while (WORKSPACE_PREFIX_RE.test(out)) out = out.replace(WORKSPACE_PREFIX_RE, "");
  return out;
}

/** Prefix a visible name with a Workspace's index (idempotent on the visible part). */
export function withWorkspacePrefix(visible: string, wsIndex: number): string {
  return `w${wsIndex}.${displayName(visible)}`;
}

/** The 1-based Workspace index encoded in a session's prefix, or null if none. */
export function workspaceIndexOf(name: string): number | null {
  const m = WORKSPACE_PREFIX_RE.exec(name);
  return m ? Number.parseInt(m[1], 10) : null;
}
