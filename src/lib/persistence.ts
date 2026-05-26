import type { WorkspaceStore } from "./layout-types";

const STORAGE_KEY = "winmux:workspaces:v1";

interface Persisted {
  version: 1;
  store: WorkspaceStore;
}

export function loadWorkspaces(): WorkspaceStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 1 || !parsed.store) return null;
    return parsed.store;
  } catch (e) {
    console.warn("loadWorkspaces failed", e);
    return null;
  }
}

export function saveWorkspaces(store: WorkspaceStore): void {
  try {
    const payload: Persisted = { version: 1, store };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("saveWorkspaces failed", e);
  }
}
