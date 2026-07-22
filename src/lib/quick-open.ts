// Headless ranking + aggregation for the global Quick Open finder.
//
// This module owns the fuzzy matching, scoring, ranking and cross-source
// aggregation for Quick Open, with no Vue/DOM/Tauri dependency so it can be
// unit-tested directly (the project's second pure test seam, after
// `navigator.ts`). The overlay component and `useQuickOpen` composable are thin
// reactive wrappers over `rankQuickOpen`.
//
// It also encodes the two product rules that must not live in the UI: an empty
// query shows only Workspaces + Sessions (files/commands excluded), and each
// kind is capped so a single source can never flood the list.

import { displayName } from "./session-names";

export type QuickOpenKind = "workspace" | "session" | "file" | "command";

/** Minimal plain candidate fed into the ranker (see `navigator.ts` `Pick<>` style). */
export interface QuickOpenCandidate {
  kind: QuickOpenKind;
  /** Stable identifier the caller uses to act on the result. */
  id: string;
  /** The text matched against and shown as the primary label. */
  label: string;
  /** Secondary line (e.g. a file's root-relative path); shown, never matched (M2). */
  subtitle?: string;
}

export interface QuickOpenResult extends QuickOpenCandidate {
  /** Higher is a better match; only meaningful relative to other results. */
  score: number;
}

export interface QuickOpenOptions {
  /** Maximum results kept per kind. Defaults to `DEFAULT_CAP_PER_KIND`. */
  capPerKind?: number;
}

/** Default per-kind result cap, keeping the list scannable. */
export const DEFAULT_CAP_PER_KIND = 8;

/** Kinds shown (in this order) when the query is empty — the useful default. */
const EMPTY_QUERY_KINDS: readonly QuickOpenKind[] = ["workspace", "session"];

// Score tiers, spaced far enough apart that within-tier tie-breaks (position and
// length penalties, all small and bounded) can never promote a lower tier above
// a higher one. Prefix beats word-boundary beats contiguous beats scattered.
const TIER_PREFIX = 4_000_000;
const TIER_WORD_BOUNDARY = 3_000_000;
const TIER_CONTIGUOUS = 2_000_000;
const TIER_SCATTERED = 1_000_000;

const SEPARATOR_RE = /[\s\-_./\\]/;

/**
 * Mark each index of `text` that begins a "word": the first character, anything
 * after a separator, and a lower→upper camelCase hump. Computed on the original
 * (cased) text so camelCase humps survive the lowercase used for matching.
 */
function computeBoundaries(text: string): boolean[] {
  const marks = new Array<boolean>(text.length).fill(false);
  for (let i = 0; i < text.length; i++) {
    if (i === 0) {
      marks[i] = true;
      continue;
    }
    const prev = text[i - 1];
    const cur = text[i];
    if (SEPARATOR_RE.test(prev)) marks[i] = true;
    else if (prev >= "a" && prev <= "z" && cur >= "A" && cur <= "Z") marks[i] = true;
  }
  return marks;
}

/**
 * Score a single label against a lowercase query, or return `null` when the
 * query is not even a scattered subsequence of the label. Higher is better.
 */
function scoreLabel(query: string, label: string): number | null {
  const q = query;
  const t = label.toLowerCase();
  if (q === "") return 0;

  const boundaries = computeBoundaries(label);

  // Tier 1 — the label starts with the query.
  if (t.startsWith(q)) return TIER_PREFIX - label.length;

  const first = t.indexOf(q);
  if (first >= 0) {
    // Tier 2 — a contiguous run that begins at a word boundary.
    let idx = first;
    while (idx >= 0) {
      if (boundaries[idx]) return TIER_WORD_BOUNDARY - idx * 100 - label.length;
      idx = t.indexOf(q, idx + 1);
    }
    // Tier 3 — a contiguous run anywhere else in the label.
    return TIER_CONTIGUOUS - first * 100 - label.length;
  }

  // Tier 4 — a scattered subsequence. Reward boundary hits and tight matches.
  let qi = 0;
  let firstPos = -1;
  let lastPos = -1;
  let boundaryHits = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstPos < 0) firstPos = ti;
      lastPos = ti;
      if (boundaries[ti]) boundaryHits++;
      qi++;
    }
  }
  if (qi < q.length) return null;
  const span = lastPos - firstPos;
  return TIER_SCATTERED + boundaryHits * 1000 - span * 10 - firstPos - t.length;
}

/** Keep the first `cap` results of each kind, preserving the incoming order. */
function capPerKind(results: QuickOpenResult[], cap: number): QuickOpenResult[] {
  const counts = new Map<QuickOpenKind, number>();
  const out: QuickOpenResult[] = [];
  for (const r of results) {
    const n = counts.get(r.kind) ?? 0;
    if (n >= cap) continue;
    counts.set(r.kind, n + 1);
    out.push(r);
  }
  return out;
}

/**
 * Rank candidates across all sources into a single list.
 *
 * An empty (or whitespace-only) query returns Workspaces then Sessions as the
 * default; a non-empty query fuzzy-ranks every candidate by match quality.
 * Either way each kind is capped at `capPerKind`.
 */
export function rankQuickOpen(
  candidates: QuickOpenCandidate[],
  query: string,
  options: QuickOpenOptions = {},
): QuickOpenResult[] {
  const cap = options.capPerKind ?? DEFAULT_CAP_PER_KIND;
  const trimmed = query.trim().toLowerCase();

  if (trimmed === "") {
    const shown = candidates.filter((c) => EMPTY_QUERY_KINDS.includes(c.kind));
    // Stable sort by kind order (workspaces before sessions), input order within.
    shown.sort(
      (a, b) => EMPTY_QUERY_KINDS.indexOf(a.kind) - EMPTY_QUERY_KINDS.indexOf(b.kind),
    );
    return capPerKind(
      shown.map((c) => ({ ...c, score: 0 })),
      cap,
    );
  }

  const scored: QuickOpenResult[] = [];
  for (const c of candidates) {
    const score = scoreLabel(trimmed, c.label);
    if (score === null) continue;
    scored.push({ ...c, score });
  }
  // Stable sort keeps input order among equal scores.
  scored.sort((a, b) => b.score - a.score);
  return capPerKind(scored, cap);
}

/** Build workspace candidates from the Workspaces store shape. */
export function workspaceCandidates(
  workspaces: ReadonlyArray<{ id: string; name: string }>,
): QuickOpenCandidate[] {
  return workspaces.map((w) => ({ kind: "workspace", id: w.id, label: w.name }));
}

/** Build session candidates, stripping the `w{index}.` daemon-name prefix. */
export function sessionCandidates(
  sessions: ReadonlyArray<{ id: string; name: string }>,
): QuickOpenCandidate[] {
  return sessions.map((s) => ({ kind: "session", id: s.id, label: displayName(s.name) }));
}

/** The final path segment of a `/`- or `\`-joined relative path. */
function fileBasename(relPath: string): string {
  const idx = Math.max(relPath.lastIndexOf("/"), relPath.lastIndexOf("\\"));
  return idx >= 0 ? relPath.slice(idx + 1) : relPath;
}

/**
 * Build file candidates from the backend file index (`api.listFiles`). The
 * basename is matched/shown as the label and the root-relative path is the
 * subtitle; the absolute path is the id the caller opens.
 */
export function fileCandidates(
  files: ReadonlyArray<{ path: string; relPath: string }>,
): QuickOpenCandidate[] {
  return files.map((f) => ({
    kind: "file",
    id: f.path,
    label: fileBasename(f.relPath),
    subtitle: f.relPath,
  }));
}

/** Build command candidates from saved Palette items; command text is the subtitle. */
export function commandCandidates(
  items: ReadonlyArray<{ id: string; label: string; command: string }>,
): QuickOpenCandidate[] {
  return items.map((it) => ({
    kind: "command",
    id: it.id,
    label: it.label.trim() || it.command,
    subtitle: it.command,
  }));
}
