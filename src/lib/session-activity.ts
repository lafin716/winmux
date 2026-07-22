// Pure reducer for transient, per-Session activity state (the pre-agreed test
// seam, after `navigator.ts` and `quick-open.ts`). It folds the daemon's
// lightweight `session-activity` events into a map of unseen-activity flags,
// treating the focused Session as already-seen and clearing a Session's entry
// when it gains focus. No Vue/DOM/Tauri dependency; `useSessions` wraps this in
// a reactive map (mirroring the `currentCwds` pattern) and the Navigator badges
// (Ticket 2) read the flags.

/** Unseen-activity flags for one Session. */
export interface SessionActivityFlags {
  /** The Session produced output while it was not the focused Session. */
  output: boolean;
  /** The Session rang a real bell (not merely an OSC-string terminator). */
  bell: boolean;
}

/** Transient per-Session activity, keyed by daemon session id. */
export type ActivityState = Record<string, SessionActivityFlags>;

/** A single activity event as delivered by the daemon/bridge. */
export interface ActivityEvent {
  id: string;
  bell: boolean;
}

/**
 * Fold one activity event into `state` given the currently focused Session id.
 *
 * An event for the focused Session (or an empty id) raises no badge and returns
 * `state` unchanged. Otherwise the Session's `output` flag is set and its `bell`
 * flag OR-accumulates with any prior bell. Returns a new object on change and
 * the same reference when nothing changes (never mutates the input).
 */
export function applyActivity(
  state: ActivityState,
  ev: ActivityEvent,
  focusedId: string | null,
): ActivityState {
  if (!ev.id || ev.id === focusedId) return state;
  const prev = state[ev.id];
  const bell = (prev?.bell ?? false) || ev.bell;
  const output = true;
  if (prev && prev.output === output && prev.bell === bell) return state;
  return { ...state, [ev.id]: { output, bell } };
}

/**
 * Remove a Session's activity entry (used when it becomes focused). Returns a
 * new object on change and the same reference when there is nothing to clear.
 */
export function clearActivity(state: ActivityState, id: string): ActivityState {
  if (!(id in state)) return state;
  const next = { ...state };
  delete next[id];
  return next;
}
