import { reactive, computed, watch } from "vue";
import type { Workspace, WorkspaceStore, LayoutNode } from "../lib/layout-types";
import { makeLeaf, nodeId } from "../lib/layout-types";
import { loadWorkspaces, saveWorkspaces } from "../lib/persistence";

function makeDefaultWorkspace(name = "Default", icon = "W"): Workspace {
  return {
    id: nodeId("ws"),
    name,
    icon,
    layout: makeLeaf(nodeId("leaf")),
  };
}

function defaultStore(): WorkspaceStore {
  const ws = makeDefaultWorkspace();
  return { workspaces: [ws], activeWorkspaceId: ws.id };
}

const state = reactive<WorkspaceStore>(defaultStore());

let loaded = false;
let saveTimer: number | null = null;

function scheduleSave() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveWorkspaces({
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
    });
    saveTimer = null;
  }, 200);
}

watch(state, scheduleSave, { deep: true });

export function loadFromStorage() {
  if (loaded) return;
  loaded = true;
  const stored = loadWorkspaces();
  if (stored && stored.workspaces.length > 0) {
    state.workspaces = stored.workspaces;
    state.activeWorkspaceId =
      stored.workspaces.find((w) => w.id === stored.activeWorkspaceId)?.id ??
      stored.workspaces[0].id;
  }
}

export function useWorkspaces() {
  const activeWorkspace = computed(
    () =>
      state.workspaces.find((w) => w.id === state.activeWorkspaceId) ??
      state.workspaces[0],
  );

  function createWorkspace(name = "Workspace", icon?: string): Workspace {
    const ws = makeDefaultWorkspace(name, icon ?? name.slice(0, 1).toUpperCase());
    state.workspaces.push(ws);
    state.activeWorkspaceId = ws.id;
    return ws;
  }

  function deleteWorkspace(id: string) {
    if (state.workspaces.length <= 1) return;
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) return;
    state.workspaces.splice(idx, 1);
    if (state.activeWorkspaceId === id) {
      state.activeWorkspaceId = state.workspaces[Math.max(0, idx - 1)].id;
    }
  }

  function renameWorkspace(id: string, name: string) {
    const ws = state.workspaces.find((w) => w.id === id);
    if (ws && name.trim()) {
      ws.name = name.trim();
      if (!ws.icon || ws.icon.length <= 1) {
        ws.icon = name.trim().slice(0, 1).toUpperCase();
      }
    }
  }

  function setActiveWorkspace(id: string) {
    if (state.workspaces.find((w) => w.id === id)) {
      state.activeWorkspaceId = id;
    }
  }

  function replaceLayout(workspaceId: string, layout: LayoutNode) {
    const ws = state.workspaces.find((w) => w.id === workspaceId);
    if (ws) ws.layout = layout;
  }

  return {
    state,
    activeWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
    setActiveWorkspace,
    replaceLayout,
  };
}
