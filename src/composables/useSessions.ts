import { reactive, computed } from "vue";
import { api, type SessionInfo } from "../lib/tauri";
import type { Workspace } from "../lib/layout-types";
import { useWorkspaces, workspaceDefaultCwd } from "./useWorkspaces";
import { useFocus } from "./useFocus";
import { usePrefs } from "./usePrefs";
import { cloneTerminalConfig } from "../lib/terminal-config";
import type { TerminalConfig } from "../lib/terminal-config";
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
const currentCwds = reactive<Record<string, string>>({});

const DAEMON_PREFIX_RE = /^w\d+\./;
const SESSION_NUM_RE = /^session-(\d+)$/;

function withCwdIntegration(terminal: TerminalConfig, args: string[]): string[] {
  const lowerArgs = args.map((arg) => arg.toLowerCase());
  switch (terminal.preset) {
    case "windows-powershell":
    case "powershell":
      if (lowerArgs.some((arg) => arg === "-command" || arg === "-file")) return args;
      return [
        ...args,
        "-NoExit",
        "-Command",
        "$global:__winmuxPrompt=(Get-Command prompt).ScriptBlock; "
          + "function global:prompt { $p=(Get-Location).Path; "
          + "[Console]::Write(([char]27 + ']9;9;' + $p + [char]7)); "
          + "& $global:__winmuxPrompt }",
      ];
    case "cmd":
      if (lowerArgs.some((arg) => arg === "/c" || arg === "/k")) return args;
      return [...args, "/K", "prompt $E]9;9;$P$E\\$P$G"];
    case "git-bash":
      if (args.length > 0 && args.join("\0") !== "--login\0-i") return args;
      return [
        "-c",
        "export PROMPT_COMMAND='printf \"\\033]7;file:///%s\\033\\\\\" \"$(pwd -W)\"'; exec bash --login -i",
      ];
    case "wsl":
      if (lowerArgs.some((arg) => arg === "-e" || arg === "--exec")) return args;
      return [
        ...args,
        "sh",
        "-lc",
        "export PROMPT_COMMAND='printf \"\\033]7;file://wsl.localhost/%s%s\\033\\\\\" \"$WSL_DISTRO_NAME\" \"$PWD\"'; exec \"${SHELL:-bash}\" -l",
      ];
    case "custom":
    default:
      return args;
  }
}

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
    for (const session of state.sessions) {
      if (session.cwd && !currentCwds[session.id]) currentCwds[session.id] = session.cwd;
    }
  }

  async function createForWorkspace(
    ws: Workspace | null | undefined,
    opts: {
      name?: string;
      shell?: string;
      shellArgs?: string[];
      cwd?: string;
      terminal?: TerminalConfig;
    } = {},
  ): Promise<SessionInfo | null> {
    const name = opts.name ?? (ws ? nextDaemonName(ws, state.sessions) : undefined);
    const cwd = opts.cwd ?? workspaceDefaultCwd(ws);
    const terminal = cloneTerminalConfig(
      opts.terminal ?? ws?.settings?.terminal ?? prefs.defaultTerminal,
    );
    const shell = opts.shell ?? terminal.program.trim();
    const requestedArgs = opts.shell
      ? (opts.shellArgs ?? [])
      : (opts.shellArgs ?? terminal.args);
    const shellArgs = opts.shell
      ? [...requestedArgs]
      : withCwdIntegration(terminal, [...requestedArgs]);
    if (!shell) {
      alert("Select a terminal program in Settings before creating a session.");
      return null;
    }
    try {
      const info = await api.createSession({
        name,
        shell,
        shellArgs: [...shellArgs],
        cwd,
      });
      state.sessions.push(info);
      if (info.cwd) currentCwds[info.id] = info.cwd;
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
    terminal?: TerminalConfig;
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
    delete currentCwds[id];
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
    currentCwd(id: string): string | undefined {
      return currentCwds[id] ?? getById(id)?.cwd ?? undefined;
    },
    setCurrentCwd(id: string, cwd: string) {
      if (cwd.trim()) currentCwds[id] = cwd.trim();
    },
  };
}
