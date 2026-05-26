export type Direction = "horizontal" | "vertical";

export interface LeafNode {
  kind: "leaf";
  id: string;
  tabs: string[];
  activeTabId: string | null;
}

export interface SplitNode {
  kind: "split";
  id: string;
  direction: Direction;
  sizes: number[];
  children: LayoutNode[];
}

export type LayoutNode = LeafNode | SplitNode;

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  layout: LayoutNode;
}

export interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export type DropZone = "center" | "left" | "right" | "top" | "bottom";

export function makeLeaf(id: string, tabs: string[] = [], activeTabId: string | null = null): LeafNode {
  return { kind: "leaf", id, tabs, activeTabId };
}

export function nodeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
