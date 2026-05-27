import type {
  LayoutNode,
  LeafNode,
  SplitNode,
  Direction,
  DropZone,
} from "../lib/layout-types";
import { makeLeaf, nodeId } from "../lib/layout-types";

export const MAX_PANES = 16;

export function leafCount(root: LayoutNode): number {
  return collectAllLeaves(root).length;
}

export function isLeaf(node: LayoutNode): node is LeafNode {
  return node.kind === "leaf";
}

export function isSplit(node: LayoutNode): node is SplitNode {
  return node.kind === "split";
}

export function findLeafBySession(root: LayoutNode, sessionId: string): LeafNode | null {
  if (isLeaf(root)) {
    return root.tabs.includes(sessionId) ? root : null;
  }
  for (const child of root.children) {
    const found = findLeafBySession(child, sessionId);
    if (found) return found;
  }
  return null;
}

export function findLeafById(root: LayoutNode, leafId: string): LeafNode | null {
  if (isLeaf(root)) return root.id === leafId ? root : null;
  for (const child of root.children) {
    const found = findLeafById(child, leafId);
    if (found) return found;
  }
  return null;
}

export function findFirstLeaf(root: LayoutNode): LeafNode {
  if (isLeaf(root)) return root;
  return findFirstLeaf(root.children[0]);
}

export function collectAllSessionIds(root: LayoutNode): string[] {
  if (isLeaf(root)) return [...root.tabs];
  const out: string[] = [];
  for (const child of root.children) out.push(...collectAllSessionIds(child));
  return out;
}

export function collectAllLeaves(root: LayoutNode): LeafNode[] {
  if (isLeaf(root)) return [root];
  const out: LeafNode[] = [];
  for (const c of root.children) out.push(...collectAllLeaves(c));
  return out;
}

/** Find parent split + index of a child node in the tree. Returns null if node is root. */
function findParent(
  root: LayoutNode,
  childId: string,
): { parent: SplitNode; index: number } | null {
  if (isLeaf(root)) return null;
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === childId) return { parent: root, index: i };
    const deeper = findParent(root.children[i], childId);
    if (deeper) return deeper;
  }
  return null;
}

export function addTabToLeaf(
  root: LayoutNode,
  leafId: string,
  sessionId: string,
  atIndex?: number,
): void {
  const leaf = findLeafById(root, leafId);
  if (!leaf) return;
  if (leaf.tabs.includes(sessionId)) {
    leaf.activeTabId = sessionId;
    return;
  }
  if (atIndex === undefined || atIndex < 0 || atIndex > leaf.tabs.length) {
    leaf.tabs.push(sessionId);
  } else {
    leaf.tabs.splice(atIndex, 0, sessionId);
  }
  leaf.activeTabId = sessionId;
}

/**
 * Remove a session ID from wherever it is in the tree. If the leaf becomes empty,
 * collapse it: remove from its parent split; if parent ends up with 1 child, replace
 * parent with that single child (preserve the parent's id slot in grandparent).
 * Returns a possibly-new root reference (if root itself was replaced).
 */
export function removeTab(
  root: LayoutNode,
  sessionId: string,
): { root: LayoutNode; removedLeafId: string | null } {
  const leaf = findLeafBySession(root, sessionId);
  if (!leaf) return { root, removedLeafId: null };
  const idx = leaf.tabs.indexOf(sessionId);
  leaf.tabs.splice(idx, 1);
  if (leaf.activeTabId === sessionId) {
    leaf.activeTabId = leaf.tabs[Math.min(idx, leaf.tabs.length - 1)] ?? null;
  }
  if (leaf.tabs.length > 0) {
    return { root, removedLeafId: null };
  }
  // Empty leaf - collapse
  return { root: collapseEmptyLeaf(root, leaf.id), removedLeafId: leaf.id };
}

function collapseEmptyLeaf(root: LayoutNode, emptyLeafId: string): LayoutNode {
  if (isLeaf(root)) {
    // Root is the empty leaf; keep it as an empty leaf (root always exists).
    return root;
  }
  // Recursively collapse children first, then this node.
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i];
    if (isLeaf(c) && c.id === emptyLeafId) {
      // skip this child
      continue;
    }
    const collapsed = isSplit(c) ? collapseEmptyLeaf(c, emptyLeafId) : c;
    newChildren.push(collapsed);
    newSizes.push(root.sizes[i]);
  }
  if (newChildren.length === 0) {
    // Should not happen since root is always Split here; return a fresh leaf.
    return makeLeaf(nodeId("leaf"));
  }
  if (newChildren.length === 1) {
    // Replace this split with its only remaining child.
    return newChildren[0];
  }
  // Renormalize sizes
  const sum = newSizes.reduce((a, b) => a + b, 0) || 1;
  const normalized = newSizes.map((s) => s / sum);
  return { ...root, children: newChildren, sizes: normalized };
}

/**
 * Split the target leaf in a given direction. The new sibling leaf contains the moved session.
 * position: "before" places the new leaf in front of the target; "after" places it behind.
 * Returns possibly-new root.
 */
export function splitLeaf(
  root: LayoutNode,
  targetLeafId: string,
  sessionId: string,
  direction: Direction,
  position: "before" | "after",
): LayoutNode {
  const target = findLeafById(root, targetLeafId);
  if (!target) return root;

  const newLeaf = makeLeaf(nodeId("leaf"), [sessionId], sessionId);

  // If root is the target leaf, wrap into a split.
  if (root === target) {
    const split: SplitNode = {
      kind: "split",
      id: nodeId("split"),
      direction,
      sizes: [0.5, 0.5],
      children: position === "before" ? [newLeaf, target] : [target, newLeaf],
    };
    return split;
  }

  const found = findParent(root, target.id);
  if (!found) return root;
  const { parent, index } = found;

  if (parent.direction === direction) {
    // Insert sibling in same split
    const insertAt = position === "before" ? index : index + 1;
    parent.children.splice(insertAt, 0, newLeaf);
    // Take half of target's size for the new leaf
    const half = parent.sizes[index] / 2;
    parent.sizes[index] = half;
    parent.sizes.splice(insertAt, 0, half);
    return root;
  }

  // Need to create a nested split replacing target's slot
  const nested: SplitNode = {
    kind: "split",
    id: nodeId("split"),
    direction,
    sizes: [0.5, 0.5],
    children: position === "before" ? [newLeaf, target] : [target, newLeaf],
  };
  parent.children[index] = nested;
  return root;
}

/**
 * Move a tab to the center (merge) of another leaf.
 * Returns possibly-new root.
 */
export function moveTabToLeaf(
  root: LayoutNode,
  sessionId: string,
  targetLeafId: string,
): LayoutNode {
  const source = findLeafBySession(root, sessionId);
  if (!source) return root;
  if (source.id === targetLeafId) return root;
  const { root: r1 } = removeTab(root, sessionId);
  addTabToLeaf(r1, targetLeafId, sessionId);
  return r1;
}

/**
 * Move a tab into a new split of another leaf.
 */
export function moveTabAsSplit(
  root: LayoutNode,
  sessionId: string,
  targetLeafId: string,
  direction: Direction,
  position: "before" | "after",
): LayoutNode {
  const source = findLeafBySession(root, sessionId);
  if (!source) return root;
  // If source IS the target and is the only tab, no-op.
  if (source.id === targetLeafId && source.tabs.length === 1) return root;
  const { root: r1 } = removeTab(root, sessionId);
  return splitLeaf(r1, targetLeafId, sessionId, direction, position);
}

/**
 * Reorder a tab inside a leaf or move it to another leaf at a specific index.
 */
export function moveTabToIndex(
  root: LayoutNode,
  sessionId: string,
  targetLeafId: string,
  atIndex: number,
): LayoutNode {
  const source = findLeafBySession(root, sessionId);
  if (!source) return root;
  if (source.id === targetLeafId) {
    // Reorder within same leaf
    const oldIdx = source.tabs.indexOf(sessionId);
    if (oldIdx === atIndex) return root;
    source.tabs.splice(oldIdx, 1);
    const newIdx = atIndex > oldIdx ? atIndex - 1 : atIndex;
    source.tabs.splice(newIdx, 0, sessionId);
    source.activeTabId = sessionId;
    return root;
  }
  const { root: r1 } = removeTab(root, sessionId);
  addTabToLeaf(r1, targetLeafId, sessionId, atIndex);
  return r1;
}

export function resizeSplit(
  root: LayoutNode,
  splitId: string,
  sizes: number[],
): void {
  const split = findSplitById(root, splitId);
  if (!split) return;
  if (sizes.length !== split.sizes.length) return;
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  split.sizes = sizes.map((s) => s / sum);
}

function findSplitById(root: LayoutNode, splitId: string): SplitNode | null {
  if (isLeaf(root)) return null;
  if (root.id === splitId) return root;
  for (const c of root.children) {
    const found = findSplitById(c, splitId);
    if (found) return found;
  }
  return null;
}

/**
 * Remove session IDs from the tree that aren't in validIds. Collapses empty leaves.
 * Root is guaranteed to remain a valid node (may become an empty leaf).
 */
export function pruneMissing(root: LayoutNode, validIds: Set<string>): LayoutNode {
  // First, drop missing session IDs from every leaf.
  const allLeaves = collectAllLeaves(root);
  for (const leaf of allLeaves) {
    leaf.tabs = leaf.tabs.filter((id) => validIds.has(id));
    if (leaf.activeTabId && !validIds.has(leaf.activeTabId)) {
      leaf.activeTabId = leaf.tabs[0] ?? null;
    }
  }
  // Then collapse empty leaves repeatedly.
  let current: LayoutNode = root;
  while (true) {
    const empties = collectAllLeaves(current).filter((l) => l.tabs.length === 0);
    if (empties.length === 0) break;
    // If root itself is a leaf and empty, we keep it (root must always exist).
    if (isLeaf(current) && current.tabs.length === 0) break;
    const target = empties.find((l) => !(isLeaf(current) && current.id === l.id));
    if (!target) break;
    current = collapseEmptyLeaf(current, target.id);
  }
  return current;
}

/**
 * Convert mouse position within a leaf body rect to a drop zone.
 * Edges have ~25% threshold; center is the remaining middle.
 */
export function computeDropZone(
  x: number,
  y: number,
  rect: DOMRect,
  edgeRatio = 0.25,
): DropZone {
  const localX = x - rect.left;
  const localY = y - rect.top;
  const w = rect.width;
  const h = rect.height;
  const edgeW = w * edgeRatio;
  const edgeH = h * edgeRatio;

  // Determine which edge (if any) the cursor is closest to within threshold.
  const distLeft = localX;
  const distRight = w - localX;
  const distTop = localY;
  const distBottom = h - localY;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist > Math.min(edgeW, edgeH)) return "center";
  if (minDist === distLeft) return "left";
  if (minDist === distRight) return "right";
  if (minDist === distTop) return "top";
  return "bottom";
}

/** Build the chain of (split, childIndex) from root down to the given leaf. */
function findPath(
  root: LayoutNode,
  leafId: string,
): Array<{ split: SplitNode; index: number }> | null {
  if (isLeaf(root)) return root.id === leafId ? [] : null;
  for (let i = 0; i < root.children.length; i++) {
    const sub = findPath(root.children[i], leafId);
    if (sub) return [{ split: root, index: i }, ...sub];
  }
  return null;
}

/** Dive into a subtree to pick the leaf closest in the given direction. */
function diveToLeaf(node: LayoutNode, dir: "left" | "right" | "up" | "down"): string {
  let cur = node;
  while (isSplit(cur)) {
    const matchH = (dir === "left" || dir === "right") && cur.direction === "horizontal";
    const matchV = (dir === "up" || dir === "down") && cur.direction === "vertical";
    if (matchH || matchV) {
      const lastIdx = cur.children.length - 1;
      const pickLast = dir === "left" || dir === "up";
      cur = cur.children[pickLast ? lastIdx : 0];
    } else {
      cur = cur.children[0];
    }
  }
  return cur.id;
}

/**
 * Find the leaf id adjacent to `leafId` in the given direction, walking up the
 * ancestry until a matching-direction split with a usable sibling is found.
 * Returns null when no neighbor exists (current leaf is at the edge in that direction).
 */
export function findNeighborLeafId(
  root: LayoutNode,
  leafId: string,
  dir: "left" | "right" | "up" | "down",
): string | null {
  const path = findPath(root, leafId);
  if (!path) return null;
  const wantDir: Direction = (dir === "left" || dir === "right") ? "horizontal" : "vertical";
  const offset = (dir === "left" || dir === "up") ? -1 : 1;
  for (let i = path.length - 1; i >= 0; i--) {
    const { split, index } = path[i];
    if (split.direction !== wantDir) continue;
    const sibIdx = index + offset;
    if (sibIdx < 0 || sibIdx >= split.children.length) continue;
    return diveToLeaf(split.children[sibIdx], dir);
  }
  return null;
}

/**
 * Replace the target leaf with two nested 50/50 splits using two new sessions.
 * The original leaf occupies 1/2 of the resulting area; the named corner gets
 * `sessionAId` (focus target), the cell sharing the inner column gets `sessionBId`.
 */
export function quadrantSplitLeaf(
  root: LayoutNode,
  targetLeafId: string,
  sessionAId: string,
  sessionBId: string,
  corner: "tl" | "tr" | "bl" | "br",
): LayoutNode {
  const target = findLeafById(root, targetLeafId);
  if (!target) return root;

  const leafA = makeLeaf(nodeId("leaf"), [sessionAId], sessionAId);
  const leafB = makeLeaf(nodeId("leaf"), [sessionBId], sessionBId);

  // Inner vertical split: A on top for TL/TR, on bottom for BL/BR.
  const innerChildren: LayoutNode[] =
    (corner === "tl" || corner === "tr") ? [leafA, leafB] : [leafB, leafA];
  const inner: SplitNode = {
    kind: "split",
    id: nodeId("split"),
    direction: "vertical",
    sizes: [0.5, 0.5],
    children: innerChildren,
  };

  // Outer horizontal split: inner on left for TL/BL, on right for TR/BR.
  const outerChildren: LayoutNode[] =
    (corner === "tl" || corner === "bl") ? [inner, target] : [target, inner];
  const outer: SplitNode = {
    kind: "split",
    id: nodeId("split"),
    direction: "horizontal",
    sizes: [0.5, 0.5],
    children: outerChildren,
  };

  if (root === target) return outer;

  const found = findParent(root, target.id);
  if (!found) return root;
  found.parent.children[found.index] = outer;
  return root;
}

export function zoneToSplit(zone: DropZone): {
  direction: Direction;
  position: "before" | "after";
} | null {
  switch (zone) {
    case "left": return { direction: "horizontal", position: "before" };
    case "right": return { direction: "horizontal", position: "after" };
    case "top": return { direction: "vertical", position: "before" };
    case "bottom": return { direction: "vertical", position: "after" };
    default: return null;
  }
}
