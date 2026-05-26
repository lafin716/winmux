import { reactive, computed } from "vue";
import { api, type SessionInfo } from "../lib/tauri";

interface Store {
  sessions: SessionInfo[];
  activeId: string | null;
}

const state = reactive<Store>({
  sessions: [],
  activeId: null,
});

export function useSessions() {
  const active = computed(() =>
    state.sessions.find((s) => s.id === state.activeId) ?? null,
  );

  async function refresh() {
    state.sessions = await api.listSessions();
    if (state.activeId && !state.sessions.find((s) => s.id === state.activeId)) {
      state.activeId = state.sessions[0]?.id ?? null;
    }
  }

  async function create(opts: { name?: string; shell?: string } = {}) {
    const info = await api.createSession(opts);
    state.sessions.push(info);
    state.activeId = info.id;
    return info;
  }

  async function kill(id: string) {
    await api.killSession(id);
    const idx = state.sessions.findIndex((s) => s.id === id);
    if (idx >= 0) state.sessions.splice(idx, 1);
    if (state.activeId === id) {
      state.activeId = state.sessions[0]?.id ?? null;
    }
  }

  function setActive(id: string) {
    if (state.sessions.find((s) => s.id === id)) state.activeId = id;
  }

  function next() {
    if (state.sessions.length < 2 || !state.activeId) return;
    const idx = state.sessions.findIndex((s) => s.id === state.activeId);
    const n = state.sessions[(idx + 1) % state.sessions.length];
    state.activeId = n.id;
  }

  function prev() {
    if (state.sessions.length < 2 || !state.activeId) return;
    const idx = state.sessions.findIndex((s) => s.id === state.activeId);
    const n = state.sessions[(idx - 1 + state.sessions.length) % state.sessions.length];
    state.activeId = n.id;
  }

  function selectByIndex(i: number) {
    const s = state.sessions[i];
    if (s) state.activeId = s.id;
  }

  async function rename(id: string, name: string) {
    await api.renameSession(id, name);
    const s = state.sessions.find((x) => x.id === id);
    if (s) s.name = name;
  }

  return {
    state,
    active,
    refresh,
    create,
    kill,
    setActive,
    next,
    prev,
    selectByIndex,
    rename,
  };
}
