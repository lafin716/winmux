import { reactive, computed } from "vue";
import { api, type SessionInfo } from "../lib/tauri";
import { useWorkspaces } from "./useWorkspaces";
import { useFocus } from "./useFocus";
import {
  addTabToLeaf,
  findFirstLeaf,
  findLeafById,
  findLeafBySession,
  removeTab,
} from "./useLayout";

interface Store {
  sessions: SessionInfo[];
}

const state = reactive<Store>({
  sessions: [],
});

export function useSessions() {
  const { activeWorkspace, replaceLayout, state: wsState } = useWorkspaces();
  const { focusedLeafId, setFocusedLeaf } = useFocus();

  function getById(id: string): SessionInfo | undefined {
    return state.sessions.find((s) => s.id === id);
  }

  const focusedSession = computed<SessionInfo | null>(() => {
    const ws = activeWorkspace.value;
    if (!ws || !focusedLeafId.value) return null;
    const leaf = findLeafById(ws.layout, focusedLeafId.value);
    if (!leaf || !leaf.activeTabId) return null;
    return getById(leaf.activeTabId) ?? null;
  });

  async function refresh() {
    state.sessions = await api.listSessions();
  }

  async function create(opts: { name?: string; shell?: string } = {}) {
    const info = await api.createSession(opts);
    state.sessions.push(info);
    const ws = activeWorkspace.value;
    if (ws) {
      const targetLeafId =
        focusedLeafId.value && findLeafById(ws.layout, focusedLeafId.value)
          ? focusedLeafId.value
          : findFirstLeaf(ws.layout).id;
      addTabToLeaf(ws.layout, targetLeafId, info.id);
      setFocusedLeaf(targetLeafId);
    }
    return info;
  }

  async function kill(id: string) {
    await api.killSession(id);
    const idx = state.sessions.findIndex((s) => s.id === id);
    if (idx >= 0) state.sessions.splice(idx, 1);
    for (const ws of wsState.workspaces) {
      if (findLeafBySession(ws.layout, id)) {
        const { root } = removeTab(ws.layout, id);
        if (root !== ws.layout) replaceLayout(ws.id, root);
      }
    }
  }

  async function rename(id: string, name: string) {
    await api.renameSession(id, name);
    const s = state.sessions.find((x) => x.id === id);
    if (s) s.name = name;
  }

  return {
    state,
    focusedSession,
    refresh,
    create,
    kill,
    rename,
    getById,
  };
}
