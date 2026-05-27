import type { WorkspaceStore } from "./layout-types";
import type { Keybinding } from "./keybindings";

const STORAGE_KEY = "winmux:workspaces:v1";
const KEYBINDINGS_KEY = "winmux:keybindings:v1";

interface Persisted {
  version: 1;
  store: WorkspaceStore;
}

interface PersistedKeybindings {
  version: 1;
  bindings: Record<string, Keybinding>;
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

export function loadKeybindings(): Record<string, Keybinding> | null {
  try {
    const raw = localStorage.getItem(KEYBINDINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedKeybindings;
    if (parsed.version !== 1 || !parsed.bindings) return null;
    return parsed.bindings;
  } catch (e) {
    console.warn("loadKeybindings failed", e);
    return null;
  }
}

export function saveKeybindings(bindings: Record<string, Keybinding>): void {
  try {
    const payload: PersistedKeybindings = { version: 1, bindings };
    localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("saveKeybindings failed", e);
  }
}
