import { reactive, computed } from "vue";
import { api, type SessionInfo } from "../lib/tauri";
import type { Workspace } from "../lib/layout-types";
import { useWorkspaces, workspaceDefaultCwd } from "./useWorkspaces";
import { useFocus } from "./useFocus";
import { usePrefs } from "./usePrefs";
import { cloneTerminalConfig } from "../lib/terminal-config";
import {
  addTabToLeaf,
  collectAllSessionIds,
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

const DAEMON_PREFIX_RE = /^w\d+\./;
const SESSION_NUM_RE = /^session-(\d+)$/;

export function displayName(name: string): string {
  let out = name;
  while (DAEMON_PREFIX_RE.test(out)) out = out.replace(DAEMON_PREFIX_RE, "");
  return out;
}

export function withWorkspacePrefix(visible: string, wsIndex: number): string {
  return `w${wsIndex}.${displayName(visible)}`;
}

export function nextDaemonName(ws: Workspace, sessions: SessionInfo[]): string {
  const usedIds = new Set(collectAllSessionIds(ws.layout));
  const usedNums = new Set<number>();
  for (const s of sessions) {
    if (!usedIds.has(s.id)) continue;
    const m = displayName(s.name).match(SESSION_NUM_RE);
    if (m) usedNums.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (usedNums.has(n)) n++;
  return `w${ws.index}.session-${n}`;
}

export function useSessions() {
  const { activeWorkspace, replaceLayout, state: wsState } = useWorkspaces();
  const { focusedLeafId, setFocusedLeaf } = useFocus();
  const { prefs } = usePrefs();

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

  const workspaceSessions = computed<SessionInfo[]>(() => {
    const ws = activeWorkspace.value;
    if (!ws) return [];
    const ids = collectAllSessionIds(ws.layout);
    const out: SessionInfo[] = [];
    for (const id of ids) {
      const s = state.sessions.find((x) => x.id === id);
      if (s) out.push(s);
    }
    return out;
  });

  async function refresh() {
    state.sessions = await api.listSessions();
  }

  async function createForWorkspace(
    ws: Workspace | null | undefined,
    opts: {
      name?: string;
      shell?: string;
      shellArgs?: string[];
      cwd?: string;
    } = {},
  ): Promise<SessionInfo | null> {
    const name = opts.name ?? (ws ? nextDaemonName(ws, state.sessions) : undefined);
    const cwd = opts.cwd ?? workspaceDefaultCwd(ws);
    const terminal = cloneTerminalConfig(ws?.settings?.terminal ?? prefs.defaultTerminal);
    const shell = opts.shell ?? terminal.program.trim();
    const shellArgs = opts.shell
      ? (opts.shellArgs ?? [])
      : (opts.shellArgs ?? terminal.args);
    if (!shell) {
      alert("Select a terminal program in Settings before creating a session.");
      return null;
    }
    try {
      const info = await api.createSession({
        ...opts,
        name,
        shell,
        shellArgs: [...shellArgs],
        cwd,
      });
      state.sessions.push(info);
      return info;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to create terminal:\n${message}`);
      return null;
    }
  }

  async function create(opts: {
    name?: string;
    shell?: string;
    shellArgs?: string[];
    cwd?: string;
  } = {}) {
    const ws = activeWorkspace.value;
    const info = await createForWorkspace(ws, opts);
    if (!info) return null;
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
    const s = state.sessions.find((x) => x.id === id);
    const ws = activeWorkspace.value;
    const prefix = ws ? `w${ws.index}.` : "";
    const fullName = `${prefix}${displayName(name)}`;
    await api.renameSession(id, fullName);
    if (s) s.name = fullName;
  }

  return {
    state,
    focusedSession,
    workspaceSessions,
    refresh,
    create,
    createForWorkspace,
    kill,
    rename,
    getById,
  };
}
