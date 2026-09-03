<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { homeDir } from "@tauri-apps/api/path";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useSettings } from "../composables/useSettings";
import { useKeybindings } from "../composables/useKeybindings";
import { useWorkspaces } from "../composables/useWorkspaces";
import { usePrefs } from "../composables/usePrefs";
import { useSessions } from "../composables/useSessions";
import { useConfirm } from "../composables/useConfirm";
import {
  addAccountProfile,
  renameAccountProfile,
  removeAccountProfile,
  resolveProfileEnv,
  profilesForAgent,
  launchCommandForProfile,
  CLI_AGENTS,
  type AccountAuthMethod,
  type AccountProfile,
  type CliAgentKind,
} from "../composables/useAccountProfiles";
import { openOAuthLoginWindow } from "../lib/floating-login";
import { api } from "../lib/tauri";
import {
  captureKeybinding,
  formatKeybinding,
  sameBinding,
  type ActionDef,
  type ActionId,
  type Keybinding,
} from "../lib/keybindings";
import {
  usePalette,
  addPaletteItem,
  updatePaletteItem,
  removePaletteItem,
} from "../composables/usePalette";
import {
  TERMINAL_PRESETS,
  cloneTerminalConfig,
  configForPreset,
  type TerminalConfig,
  type TerminalPreset,
} from "../lib/terminal-config";
import type { PaletteUiMode } from "../lib/persistence";

const { closeSettings } = useSettings();
const { actions, bindingFor, prefixFor, setBinding, resetBinding, resetAll, isOverridden } =
  useKeybindings();
const { items: paletteItems } = usePalette();
const { state: workspaceState, activeWorkspace, updateWorkspaceSettings } = useWorkspaces();
const { prefs, setPref } = usePrefs();
const { create: createSession } = useSessions();
const { confirm } = useConfirm();

type Category = "terminal" | "accounts" | "workspaces" | "keybindings" | "palette";
const activeCategory = ref<Category>("terminal");

const newProfileLabel = reactive<Record<CliAgentKind, string>>({ claude: "", codex: "" });
// Only meaningful for "claude" — Codex keeps the single-flow "add profile" UI.
const newProfileAuthMethod = reactive<Record<CliAgentKind, AccountAuthMethod>>({
  claude: "oauth",
  codex: "oauth",
});
const newProfileToken = reactive<Record<CliAgentKind, string>>({ claude: "", codex: "" });

async function handleAddProfile(agent: CliAgentKind) {
  const label = newProfileLabel[agent].trim();
  if (!label) return;
  const method = agent === "claude" ? newProfileAuthMethod.claude : "oauth";
  const token = newProfileToken.claude.trim();
  if (agent === "claude" && method === "setup-token" && !token) {
    alert("Paste the token printed by `claude setup-token` first.");
    return;
  }
  try {
    const profile = await addAccountProfile(agent, label, method);
    newProfileLabel[agent] = "";
    if (agent === "claude" && method === "setup-token") {
      try {
        await api.setAccountToken(agent, profile.id, token);
        newProfileToken.claude = "";
      } catch (error) {
        removeAccountProfile(profile.id);
        throw error;
      }
    } else if (agent === "claude") {
      await openOAuthLoginWindow(profile);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`Failed to create account profile:\n${message}`);
  }
}

async function handleOpenFolder(profile: AccountProfile) {
  try {
    await revealItemInDir(profile.configDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`Failed to open folder:\n${message}`);
  }
}

async function handleRemoveProfile(profile: AccountProfile) {
  const ok = await confirm({
    message: `Remove "${profile.label}"? Its saved login stays on disk and comes back if you `
      + "re-add a profile pointed at the same folder.",
  });
  if (ok) removeAccountProfile(profile.id);
}

async function handleLaunchProfile(profile: AccountProfile) {
  closeSettings();
  await createSession({
    env: await resolveProfileEnv(profile),
    launchCommand: launchCommandForProfile(profile),
  });
}

/**
 * "New session" for the Accounts "System" row: same as a plain new terminal,
 * just pre-seeded to run the agent's CLI with no profile env override.
 */
async function handleLaunchSystemSession(command: string) {
  closeSettings();
  await createSession({ launchCommand: command });
}

// Resolved once on mount so the Accounts "System" row can show each agent's
// real unset-default config path instead of a hardcoded username guess.
const homeDirPath = ref<string | null>(null);

/** The config path used when no profile is picked for `agent` — CLAUDE_CONFIG_DIR/CODEX_HOME's own unset-default location. */
function systemConfigDir(agent: CliAgentKind): string {
  if (!homeDirPath.value) return "";
  const home = homeDirPath.value.replace(/[\\/]+$/, "");
  return `${home}\\${agent === "claude" ? ".claude" : ".codex"}`;
}

function setGlobalTerminal(config: TerminalConfig) {
  setPref("defaultTerminal", cloneTerminalConfig(config));
}

function updateGlobalTerminal(patch: Partial<TerminalConfig>) {
  setGlobalTerminal({ ...cloneTerminalConfig(prefs.defaultTerminal), ...patch });
}

function applyGlobalPreset(value: string) {
  setGlobalTerminal(configForPreset(value as TerminalPreset));
}

function setWorkspaceTerminalEnabled(id: string, enabled: boolean) {
  updateWorkspaceSettings(id, {
    terminal: enabled ? cloneTerminalConfig(prefs.defaultTerminal) : null,
  });
}

function workspaceTerminal(id: string): TerminalConfig | null {
  return workspaceState.workspaces.find((ws) => ws.id === id)?.settings?.terminal ?? null;
}

function updateWorkspaceTerminal(id: string, patch: Partial<TerminalConfig>) {
  const current = workspaceTerminal(id);
  if (!current) return;
  updateWorkspaceSettings(id, {
    terminal: { ...cloneTerminalConfig(current), ...patch },
  });
}

function applyWorkspacePreset(id: string, value: string) {
  updateWorkspaceSettings(id, {
    terminal: configForPreset(value as TerminalPreset),
  });
}

async function chooseTerminalProgram() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Select terminal program",
    filters: [{ name: "Programs", extensions: ["exe", "cmd", "bat", "com"] }],
  });
  if (typeof selected !== "string") return;
  updateGlobalTerminal({ preset: "custom", program: selected });
}

function updateGlobalArg(index: number, value: string) {
  const args = [...prefs.defaultTerminal.args];
  args[index] = value;
  updateGlobalTerminal({ args });
}

function addGlobalArg() {
  updateGlobalTerminal({ args: [...prefs.defaultTerminal.args, ""] });
}

function removeGlobalArg(index: number) {
  updateGlobalTerminal({
    args: prefs.defaultTerminal.args.filter((_, argIndex) => argIndex !== index),
  });
}

function addPaletteRow() {
  addPaletteItem({ label: "New item", command: "", autoRun: false });
}

function updateDefaultCwd(id: string, value: string) {
  updateWorkspaceSettings(id, { defaultCwd: value });
}

function clearDefaultCwd(id: string) {
  updateWorkspaceSettings(id, { defaultCwd: "" });
}

async function chooseDefaultCwd(id: string) {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select default folder",
  });
  if (typeof selected === "string") {
    updateWorkspaceSettings(id, { defaultCwd: selected });
  }
}
const capturingId = ref<ActionId | null>(null);

function startCapture(id: ActionId) {
  capturingId.value = id;
}

function cancelCapture() {
  capturingId.value = null;
}

function onCaptureKey(ev: KeyboardEvent) {
  if (!capturingId.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.key === "Escape") {
    capturingId.value = null;
    return;
  }
  if (["Control", "Shift", "Alt", "Meta"].includes(ev.key)) return;
  const captured = captureKeybinding(ev);
  if (!captured) return;
  setBinding(capturingId.value, captured);
  capturingId.value = null;
}

function clearBinding(id: ActionId) {
  setBinding(id, null);
}

function onEscape(ev: KeyboardEvent) {
  if (ev.key === "Escape" && !capturingId.value) {
    ev.stopPropagation();
    closeSettings();
  }
}

const conflicts = computed(() => {
  const map = new Map<string, ActionId[]>();
  for (const a of actions) {
    const b = bindingFor(a.id as ActionId);
    if (!b || !b.key) continue;
    const k = JSON.stringify({
      key: b.key.toLowerCase(),
      c: !!b.ctrl, s: !!b.shift, a: !!b.alt, m: !!b.meta,
    });
    const arr = map.get(k) ?? [];
    arr.push(a.id as ActionId);
    map.set(k, arr);
  }
  const set = new Set<ActionId>();
  for (const arr of map.values()) if (arr.length > 1) for (const id of arr) set.add(id);
  return set;
});

// Actions grouped for the Keybindings category's 3 cards (session / pane /
// window+settings) — presentational grouping only, same underlying data.
const actionsByCategory = computed(() => {
  const groups: Record<ActionDef["category"], ActionDef[]> = {
    session: [], pane: [], window: [], settings: [],
  };
  for (const a of actions) groups[a.category].push(a);
  return groups;
});

function hasConflict(id: ActionId): boolean {
  return conflicts.value.has(id);
}

function displayBinding(id: ActionId): string {
  if (capturingId.value === id) return "Press a key... (Esc to cancel)";
  const b = bindingFor(id);
  return formatKeybinding(b, prefixFor(id));
}

function isUnbound(b: Keybinding): boolean {
  return !b || !b.key;
}

onMounted(() => {
  window.addEventListener("keydown", onCaptureKey, true);
  window.addEventListener("keydown", onEscape);
  homeDir()
    .then((dir) => { homeDirPath.value = dir; })
    .catch((error) => console.warn("Failed to resolve home directory", error));
});
onUnmounted(() => {
  window.removeEventListener("keydown", onCaptureKey, true);
  window.removeEventListener("keydown", onEscape);
});

// reference sameBinding so unused-import isn't flagged after a refactor
void sameBinding;
</script>

<template>
  <div class="settings-shell">
    <header class="topbar">
      <div class="topbar-left">
        <div class="app-icon">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="15" height="15" rx="2"/><path d="M10 2.5v15M2.5 11h7.5"/></svg>
        </div>
        <div class="title-block">
          <div class="title">Settings</div>
          <div class="subtitle">winmux configuration</div>
        </div>
      </div>
      <div class="topbar-right">
        <span class="esc-hint">Esc</span>
        <button class="close" @click="closeSettings">&times;</button>
      </div>
    </header>

    <div class="body">
      <aside class="nav">
        <div
          :class="['nav-item', { active: activeCategory === 'terminal' }]"
          @click="activeCategory = 'terminal'"
        >
          <div class="nav-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M6.5 8l3 2.2-3 2.2"/><path d="M11 12.4h3"/></svg></div>
          <div class="nav-text">
            <div class="nav-label">Terminal</div>
            <div class="nav-desc">Shell &amp; workspace overrides</div>
          </div>
        </div>
        <div
          :class="['nav-item', { active: activeCategory === 'accounts' }]"
          @click="activeCategory = 'accounts'"
        >
          <div class="nav-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7.2" r="3"/><path d="M4.2 16.5c0-3.2 2.6-5.2 5.8-5.2s5.8 2 5.8 5.2"/></svg></div>
          <div class="nav-text">
            <div class="nav-label">Accounts</div>
            <div class="nav-desc">Multi-account CLI logins</div>
          </div>
        </div>
        <div
          :class="['nav-item', { active: activeCategory === 'workspaces' }]"
          @click="activeCategory = 'workspaces'"
        >
          <div class="nav-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5.8c0-.7.6-1.3 1.3-1.3H8l1.6 2h6.6c.7 0 1.3.6 1.3 1.3v6.9c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3z"/></svg></div>
          <div class="nav-text">
            <div class="nav-label">Workspaces</div>
            <div class="nav-desc">Per-workspace default folder</div>
          </div>
        </div>
        <div
          :class="['nav-item', { active: activeCategory === 'keybindings' }]"
          @click="activeCategory = 'keybindings'"
        >
          <div class="nav-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.2" y="5.5" width="15.6" height="10" rx="1.8"/><path d="M5.8 12h8.4"/><circle cx="5.6" cy="8.6" r="0.35" fill="currentColor" stroke="none"/><circle cx="8.4" cy="8.6" r="0.35" fill="currentColor" stroke="none"/><circle cx="11.2" cy="8.6" r="0.35" fill="currentColor" stroke="none"/><circle cx="14" cy="8.6" r="0.35" fill="currentColor" stroke="none"/></svg></div>
          <div class="nav-text">
            <div class="nav-label">Keybindings</div>
            <div class="nav-desc">Shortcuts &amp; prefix keys</div>
          </div>
        </div>
        <div
          :class="['nav-item', { active: activeCategory === 'palette' }]"
          @click="activeCategory = 'palette'"
        >
          <div class="nav-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="9.5" height="9.5" rx="2"/><rect x="7" y="7" width="9.5" height="9.5" rx="2"/></svg></div>
          <div class="nav-text">
            <div class="nav-label">Palette</div>
            <div class="nav-desc">Quick command menu</div>
          </div>
        </div>
      </aside>

      <main class="content">
        <div class="content-inner">
          <template v-if="activeCategory === 'terminal'">
            <div class="panel-header">
              <div>
                <div class="panel-title">Terminal</div>
                <div class="panel-hint">
                  Choose the program used by new terminals. Existing sessions are not restarted.
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Global default</div>
              <div class="field-grid">
                <label>Preset</label>
                <select
                  class="input"
                  :value="prefs.defaultTerminal.preset"
                  @change="applyGlobalPreset(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="preset in TERMINAL_PRESETS" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                  </option>
                </select>

                <label>Program</label>
                <div class="inline-row">
                  <input
                    class="input mono"
                    :value="prefs.defaultTerminal.program"
                    placeholder="powershell.exe or C:\path\shell.exe"
                    @input="updateGlobalTerminal({
                      preset: 'custom',
                      program: ($event.target as HTMLInputElement).value,
                    })"
                  />
                  <button class="btn" @click="chooseTerminalProgram()">Browse</button>
                </div>

                <label>Arguments</label>
                <div class="arg-list">
                  <div
                    v-for="(_, index) in prefs.defaultTerminal.args"
                    :key="index"
                    class="arg-row"
                  >
                    <input
                      class="input mono"
                      :value="prefs.defaultTerminal.args[index]"
                      placeholder="One argument per row"
                      @input="updateGlobalArg(index, ($event.target as HTMLInputElement).value)"
                    />
                    <button class="btn" @click="removeGlobalArg(index)">Remove</button>
                  </div>
                  <button class="btn add-arg" @click="addGlobalArg">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4.5v11M4.5 10h11"/></svg>
                    Add argument
                  </button>
                </div>
              </div>
            </div>

            <div class="section-title">Workspace overrides</div>
            <div class="grid-3">
              <div v-for="ws in workspaceState.workspaces" :key="ws.id" class="card">
                <div class="ov-card-head">
                  <input
                    type="checkbox"
                    class="checkbox"
                    :checked="ws.settings?.terminal !== null"
                    @change="setWorkspaceTerminalEnabled(
                      ws.id,
                      ($event.target as HTMLInputElement).checked,
                    )"
                  />
                  <span class="name">{{ ws.name }}</span>
                  <span v-if="ws.id === activeWorkspace?.id" class="tag active-tag">Active</span>
                </div>
                <div v-if="ws.settings?.terminal" class="field-grid compact">
                  <label>Preset</label>
                  <select
                    class="input"
                    :value="ws.settings.terminal.preset"
                    @change="applyWorkspacePreset(
                      ws.id,
                      ($event.target as HTMLSelectElement).value,
                    )"
                  >
                    <option
                      v-for="preset in TERMINAL_PRESETS"
                      :key="preset.id"
                      :value="preset.id"
                    >
                      {{ preset.label }}
                    </option>
                  </select>
                  <label>Program</label>
                  <input
                    class="input mono"
                    :value="ws.settings.terminal.program"
                    @input="updateWorkspaceTerminal(ws.id, {
                      preset: 'custom',
                      program: ($event.target as HTMLInputElement).value,
                    })"
                  />
                </div>
                <div v-else class="note">Uses global default</div>
              </div>
            </div>
          </template>

          <template v-else-if="activeCategory === 'accounts'">
            <div class="panel-header">
              <div>
                <div class="panel-title">Accounts</div>
                <div class="panel-hint">
                  Each profile keeps an isolated login for that CLI, so you can stay signed in to
                  more than one account at once. "New session" opens a terminal already pointed at
                  that profile and runs the CLI for you. Pick a default with the radio button —
                  new terminals use it automatically. "System" is the CLI's own login (e.g. from
                  running <code>claude login</code> in a plain terminal) and stays the default
                  until you add a profile of your own.
                </div>
              </div>
            </div>

            <div class="grid-2">
              <div v-for="agentDef in CLI_AGENTS" :key="agentDef.id" class="card">
                <div class="card-title-left">
                  <div :class="['agent-badge', agentDef.id]">
                    <svg
                      v-if="agentDef.id === 'claude'"
                      viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                    ><path d="M3 5.5C3 4.4 3.9 3.5 5 3.5h10c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H9l-3.5 3v-3H5c-1.1 0-2-.9-2-2z"/><path d="M8.2 7.3L6.4 9.5l1.8 2.2M11.8 7.3l1.8 2.2-1.8 2.2"/></svg>
                    <svg
                      v-else
                      viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
                    ><path d="M7.2 3.8c-1.3 0-1.9.8-1.9 1.9v2.1c0 .9-.4 1.4-1.3 1.7v.5c.9.3 1.3.8 1.3 1.7v2.1c0 1.1.6 1.9 1.9 1.9M12.8 3.8c1.3 0 1.9.8 1.9 1.9v2.1c0 .9.4 1.4 1.3 1.7v.5c-.9.3-1.3.8-1.3 1.7v2.1c0 1.1-.6 1.9-1.9 1.9"/></svg>
                  </div>
                  <span class="name">{{ agentDef.label }}</span>
                </div>

                <div class="table table-accounts">
                  <div class="table-row head">
                    <div>Default</div><div>Profile</div><div>Login folder</div><div></div>
                  </div>
                  <div class="table-row body">
                    <input
                      type="radio"
                      class="radio"
                      :name="`${agentDef.id}-default`"
                      :checked="prefs.defaultProfileId[agentDef.id] === null"
                      @change="setPref(
                        'defaultProfileId',
                        { ...prefs.defaultProfileId, [agentDef.id]: null },
                      )"
                    />
                    <div class="profile-name">System<span class="tag muted-tag">Built-in</span></div>
                    <div class="path-cell" :title="systemConfigDir(agentDef.id)">
                      {{ systemConfigDir(agentDef.id) }}
                    </div>
                    <div class="row-actions">
                      <button class="btn small" @click="handleLaunchSystemSession(agentDef.command)">
                        New session
                      </button>
                    </div>
                  </div>
                  <div v-for="p in profilesForAgent(agentDef.id)" :key="p.id" class="table-row body">
                    <input
                      type="radio"
                      class="radio"
                      :name="`${agentDef.id}-default`"
                      :checked="prefs.defaultProfileId[agentDef.id] === p.id"
                      @change="setPref(
                        'defaultProfileId',
                        { ...prefs.defaultProfileId, [agentDef.id]: p.id },
                      )"
                    />
                    <div class="profile-name">
                      <input
                        class="input"
                        :value="p.label"
                        maxlength="40"
                        @input="renameAccountProfile(p.id, ($event.target as HTMLInputElement).value)"
                      />
                      <span v-if="p.authMethod === 'setup-token'" class="tag muted-tag">Token</span>
                    </div>
                    <div class="path-cell" :title="p.configDir">{{ p.configDir }}</div>
                    <div class="row-actions">
                      <button class="btn small" @click="handleLaunchProfile(p)">New session</button>
                      <button class="btn small" @click="handleOpenFolder(p)">Open folder</button>
                      <button class="btn small" @click="handleRemoveProfile(p)">Remove</button>
                    </div>
                  </div>
                </div>

                <div class="add-row">
                  <input
                    class="input"
                    v-model="newProfileLabel[agentDef.id]"
                    placeholder="e.g. Personal, Work"
                    @keydown.enter="
                      agentDef.id !== 'claude' || newProfileAuthMethod.claude !== 'setup-token'
                        ? handleAddProfile(agentDef.id)
                        : null
                    "
                  />
                  <button class="btn" @click="handleAddProfile(agentDef.id)">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4.5v11M4.5 10h11"/></svg>
                    Add profile
                  </button>
                </div>
                <template v-if="agentDef.id === 'claude'">
                  <label class="field-grid auth-method-field">
                    <span>Auth method</span>
                    <select class="input" v-model="newProfileAuthMethod.claude">
                      <option value="oauth">OAuth (default) — opens a login terminal</option>
                      <option value="setup-token">Setup token — paste an existing token</option>
                    </select>
                  </label>
                  <label v-if="newProfileAuthMethod.claude === 'setup-token'" class="field-grid auth-method-field">
                    <span>Token</span>
                    <input
                      class="input mono"
                      type="password"
                      v-model="newProfileToken.claude"
                      placeholder="Output of `claude setup-token`"
                      @keydown.enter="handleAddProfile('claude')"
                    />
                  </label>
                </template>
              </div>
            </div>
          </template>

          <template v-else-if="activeCategory === 'workspaces'">
            <div class="panel-header">
              <div>
                <div class="panel-title">Workspaces</div>
                <div class="panel-hint">
                  Set a default folder per workspace. New terminals and splits start in that folder.
                </div>
              </div>
            </div>
            <div class="table table-workspaces">
              <div class="table-row head"><div>Workspace</div><div>Default folder</div><div></div></div>
              <div v-for="ws in workspaceState.workspaces" :key="ws.id" class="table-row body">
                <div class="ws-name">
                  <span class="ws-badge">{{ ws.icon || ws.name.slice(0, 1).toUpperCase() }}</span>
                  <span class="ws-name-text">{{ ws.name }}</span>
                  <span v-if="ws.id === activeWorkspace?.id" class="tag active-tag">Active</span>
                </div>
                <input
                  class="input mono"
                  :value="ws.settings?.defaultCwd ?? ''"
                  placeholder="e.g. C:\playground\project"
                  @input="updateDefaultCwd(ws.id, ($event.target as HTMLInputElement).value)"
                />
                <div class="row-actions">
                  <button class="btn" @click="chooseDefaultCwd(ws.id)">Browse</button>
                  <button class="btn" @click="clearDefaultCwd(ws.id)">Clear</button>
                </div>
              </div>
            </div>
            <div class="note">
              Empty means winmux uses the shell/daemon default directory.
            </div>
          </template>

          <template v-else-if="activeCategory === 'keybindings'">
            <div class="panel-header">
              <div>
                <div class="panel-title">Keybindings</div>
                <div class="panel-hint">
                  Click on a key cell to record a new shortcut. Prefix shortcuts (Ctrl+B …) are fixed in this version.
                </div>
              </div>
              <div class="panel-actions">
                <button class="btn" @click="resetAll">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.2A6 6 0 1 1 5.7 14"/><path d="M4.2 4.2v4.3h4.3"/></svg>
                  Reset all
                </button>
              </div>
            </div>

            <div v-if="conflicts.size > 0" class="warn">
              ⚠ Conflicting shortcuts detected. Only one action will be triggered per keystroke.
            </div>

            <div class="grid-3">
              <div class="kb-card">
                <div class="kb-card-title">
                  <span class="kb-card-name">Session</span>
                  <span class="kb-count">{{ actionsByCategory.session.length }}</span>
                </div>
                <div
                  v-for="a in actionsByCategory.session"
                  :key="a.id"
                  :class="['kb-row', { conflict: hasConflict(a.id as ActionId) }]"
                >
                  <span class="kb-label">{{ a.label }}</span>
                  <span
                    :class="['key-cell', {
                      capturing: capturingId === a.id,
                      unbound: isUnbound(bindingFor(a.id as ActionId)) && !prefixFor(a.id as ActionId),
                    }]"
                    title="Click to record • Right-click to clear"
                    @click="capturingId === a.id ? cancelCapture() : startCapture(a.id as ActionId)"
                    @contextmenu.prevent="clearBinding(a.id as ActionId)"
                  >
                    {{ displayBinding(a.id as ActionId) }}
                  </span>
                  <button
                    class="btn icon-only"
                    :disabled="!isOverridden(a.id as ActionId)"
                    @click="resetBinding(a.id as ActionId)"
                    title="Reset to default"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.2A6 6 0 1 1 5.7 14"/><path d="M4.2 4.2v4.3h4.3"/></svg>
                  </button>
                </div>
              </div>

              <div class="kb-card">
                <div class="kb-card-title">
                  <span class="kb-card-name">Pane</span>
                  <span class="kb-count">{{ actionsByCategory.pane.length }}</span>
                </div>
                <div
                  v-for="a in actionsByCategory.pane"
                  :key="a.id"
                  :class="['kb-row', { conflict: hasConflict(a.id as ActionId) }]"
                >
                  <span class="kb-label">{{ a.label }}</span>
                  <span
                    :class="['key-cell', {
                      capturing: capturingId === a.id,
                      unbound: isUnbound(bindingFor(a.id as ActionId)) && !prefixFor(a.id as ActionId),
                    }]"
                    title="Click to record • Right-click to clear"
                    @click="capturingId === a.id ? cancelCapture() : startCapture(a.id as ActionId)"
                    @contextmenu.prevent="clearBinding(a.id as ActionId)"
                  >
                    {{ displayBinding(a.id as ActionId) }}
                  </span>
                  <button
                    class="btn icon-only"
                    :disabled="!isOverridden(a.id as ActionId)"
                    @click="resetBinding(a.id as ActionId)"
                    title="Reset to default"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.2A6 6 0 1 1 5.7 14"/><path d="M4.2 4.2v4.3h4.3"/></svg>
                  </button>
                </div>
              </div>

              <div class="col-stack">
                <div class="kb-card">
                  <div class="kb-card-title">
                    <span class="kb-card-name">Window</span>
                    <span class="kb-count">{{ actionsByCategory.window.length }}</span>
                  </div>
                  <div
                    v-for="a in actionsByCategory.window"
                    :key="a.id"
                    :class="['kb-row', { conflict: hasConflict(a.id as ActionId) }]"
                  >
                    <span class="kb-label">{{ a.label }}</span>
                    <span
                      :class="['key-cell', {
                        capturing: capturingId === a.id,
                        unbound: isUnbound(bindingFor(a.id as ActionId)) && !prefixFor(a.id as ActionId),
                      }]"
                      title="Click to record • Right-click to clear"
                      @click="capturingId === a.id ? cancelCapture() : startCapture(a.id as ActionId)"
                      @contextmenu.prevent="clearBinding(a.id as ActionId)"
                    >
                      {{ displayBinding(a.id as ActionId) }}
                    </span>
                    <button
                      class="btn icon-only"
                      :disabled="!isOverridden(a.id as ActionId)"
                      @click="resetBinding(a.id as ActionId)"
                      title="Reset to default"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.2A6 6 0 1 1 5.7 14"/><path d="M4.2 4.2v4.3h4.3"/></svg>
                    </button>
                  </div>
                </div>
                <div class="kb-card">
                  <div class="kb-card-title">
                    <span class="kb-card-name">Settings</span>
                    <span class="kb-count">{{ actionsByCategory.settings.length }}</span>
                  </div>
                  <div
                    v-for="a in actionsByCategory.settings"
                    :key="a.id"
                    :class="['kb-row', { conflict: hasConflict(a.id as ActionId) }]"
                  >
                    <span class="kb-label">{{ a.label }}</span>
                    <span
                      :class="['key-cell', {
                        capturing: capturingId === a.id,
                        unbound: isUnbound(bindingFor(a.id as ActionId)) && !prefixFor(a.id as ActionId),
                      }]"
                      title="Click to record • Right-click to clear"
                      @click="capturingId === a.id ? cancelCapture() : startCapture(a.id as ActionId)"
                      @contextmenu.prevent="clearBinding(a.id as ActionId)"
                    >
                      {{ displayBinding(a.id as ActionId) }}
                    </span>
                    <button
                      class="btn icon-only"
                      :disabled="!isOverridden(a.id as ActionId)"
                      @click="resetBinding(a.id as ActionId)"
                      title="Reset to default"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8.2A6 6 0 1 1 5.7 14"/><path d="M4.2 4.2v4.3h4.3"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeCategory === 'palette'">
            <div class="panel-header">
              <div>
                <div class="panel-title">Palette</div>
                <div class="panel-hint">
                  Middle-click inside a terminal to open the palette. "Auto-run" appends Enter; otherwise the command is pasted at the prompt.
                </div>
              </div>
              <div class="panel-actions">
                <button class="btn" @click="addPaletteRow">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 4.5v11M4.5 10h11"/></svg>
                  Add item
                </button>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Display style</div>
              <div class="style-tiles">
                <button
                  type="button"
                  :class="['style-tile', { selected: prefs.paletteUiMode === 'context' }]"
                  @click="setPref('paletteUiMode', 'context' as PaletteUiMode)"
                >
                  <div class="style-tile-preview">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 6h10M5 10h10M5 14h6"/></svg>
                  </div>
                  <div class="style-tile-label"><span class="style-tile-name">Context menu</span></div>
                  <div class="style-tile-desc">Compact list at the click position.</div>
                </button>
                <button
                  type="button"
                  :class="['style-tile', { selected: prefs.paletteUiMode === 'radial' }]"
                  @click="setPref('paletteUiMode', 'radial' as PaletteUiMode)"
                >
                  <div class="style-tile-preview">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.2"/><circle cx="10" cy="3.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.6" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.6" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="16.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.4" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.4" cy="7" r="1.3" fill="currentColor" stroke="none"/></svg>
                  </div>
                  <div class="style-tile-label"><span class="style-tile-name">Radial menu</span></div>
                  <div class="style-tile-desc">Original circular layout.</div>
                </button>
              </div>
            </div>

            <div class="table table-palette">
              <div class="table-row head">
                <div>Label</div>
                <div>Command</div>
                <div>Auto-run</div>
                <div></div>
              </div>
              <div v-for="it in paletteItems" :key="it.id" class="table-row body">
                <input
                  class="input"
                  :value="it.label"
                  maxlength="40"
                  @input="updatePaletteItem(it.id, { label: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="input mono"
                  :value="it.command"
                  @input="updatePaletteItem(it.id, { command: ($event.target as HTMLInputElement).value })"
                />
                <input
                  type="checkbox"
                  class="checkbox"
                  :checked="it.autoRun"
                  @change="updatePaletteItem(it.id, { autoRun: ($event.target as HTMLInputElement).checked })"
                />
                <div class="row-actions">
                  <button class="btn small" @click="removePaletteItem(it.id)">Remove</button>
                </div>
              </div>
              <div v-if="paletteItems.length === 0" class="empty">
                No custom items yet. Click <b>+ Add item</b> to create one.
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-shell {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: "Inter", "Segoe UI", sans-serif;
  font-size: 14px;
  display: flex;
  flex-direction: column;
}

/* Topbar */
.topbar {
  flex: 0 0 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  border-bottom: 1px solid #111111;
}
.topbar-left { display: flex; align-items: center; gap: 14px; }
.app-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #202020;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4ec9b0;
}
.app-icon svg { width: 20px; height: 20px; }
.title-block { display: flex; flex-direction: column; gap: 2px; }
.title { font-size: 17px; font-weight: 600; color: #e6e6e6; letter-spacing: -0.01em; }
.subtitle { font-size: 12px; color: #888888; }
.topbar-right { display: flex; align-items: center; gap: 14px; }
.esc-hint {
  font-size: 11px;
  color: #777777;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 3px 7px;
  font-family: Consolas, "Cascadia Mono", monospace;
}
.close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #aaaaaa;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.close:hover { background: #202020; color: #e6e6e6; }

/* Body: nav + content */
.body { flex: 1; display: flex; min-height: 0; }
.nav {
  width: 280px;
  flex: 0 0 280px;
  background: #1b1b1b;
  border-right: 1px solid #111111;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  cursor: pointer;
}
.nav-item:hover:not(.active) { background: #202020; }
.nav-item .nav-icon { width: 20px; height: 20px; flex-shrink: 0; color: #777777; }
.nav-item .nav-icon svg { width: 100%; height: 100%; }
.nav-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.nav-label { font-size: 13.5px; font-weight: 500; color: #aaaaaa; }
.nav-desc { font-size: 11px; color: #666666; }
.nav-item.active { background: #202020; border-left-color: #4ec9b0; }
.nav-item.active .nav-icon { color: #4ec9b0; }
.nav-item.active .nav-label { color: #4ec9b0; }

.content { flex: 1; min-width: 0; overflow: auto; }
.content-inner { padding: 40px 48px 56px; display: flex; flex-direction: column; gap: 24px; }

.panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.panel-title { font-size: 20px; font-weight: 600; color: #e6e6e6; margin-bottom: 6px; }
.panel-hint { font-size: 13px; color: #888888; max-width: 640px; line-height: 1.5; }
.panel-hint code {
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 0.92em;
  color: #e6e6e6;
  background: #252525;
  border-radius: 4px;
  padding: 1px 5px;
}
.panel-actions { padding-top: 2px; flex-shrink: 0; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #202020;
  color: #d4d4d4;
  border: 1px solid #333333;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: #2a2a2a; }
.btn:disabled { color: #555555; cursor: not-allowed; }
.btn svg { width: 14px; height: 14px; }
.btn.small { padding: 6px 11px; font-size: 12.5px; }
.btn.icon-only { padding: 6px; }
.btn.icon-only svg { width: 13px; height: 13px; }
.btn.add-arg { align-self: flex-start; }

/* Cards */
.card { background: #202020; border: 1px solid #2b2b2b; border-radius: 10px; padding: 22px 24px; }
.card-title { font-size: 14.5px; font-weight: 600; color: #e6e6e6; margin-bottom: 16px; }
.card-title-left { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.card-title-left .name { font-size: 14.5px; font-weight: 600; color: #e6e6e6; }
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6e6e6;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Grids */
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; align-items: start; }
.col-stack { display: flex; flex-direction: column; gap: 20px; }

/* Field grid (Terminal + Accounts auth-method fields) */
.field-grid { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 14px 16px; align-items: center; }
.field-grid.compact { grid-template-columns: 68px minmax(0, 1fr); gap: 8px 10px; }
.field-grid.auth-method-field { grid-template-columns: 110px minmax(0, 1fr); margin-top: 4px; }
.field-grid label,
.field-grid > span { font-size: 12.5px; color: #aaaaaa; }

.input, select.input {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  color: #e6e6e6;
  background: #252525;
  border: 1px solid #333333;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
}
.field-grid.compact .input { font-size: 12.5px; padding: 6px 9px; }
.input.mono { font-family: Consolas, "Cascadia Mono", monospace; }
.input:focus, select.input:focus { outline: none; border-color: #4ec9b0; }

.inline-row { display: flex; gap: 8px; }
.inline-row .input { flex: 1; }
.arg-list { display: flex; flex-direction: column; gap: 8px; }
.arg-row { display: flex; gap: 8px; }
.arg-row .input { flex: 1; }

.tag {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  border-radius: 20px;
  padding: 2px 8px;
  line-height: 1.6;
  flex-shrink: 0;
}
.tag.active-tag { color: #4ec9b0; background: rgba(78, 201, 176, 0.12); border: 1px solid rgba(78, 201, 176, 0.25); }
.tag.muted-tag { color: #777777; background: #1e1e1e; border: 1px solid #2a2a2a; }

.checkbox { accent-color: #4ec9b0; width: 16px; height: 16px; }
.radio { accent-color: #4ec9b0; width: 15px; height: 15px; cursor: pointer; }

.ov-card-head { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
.ov-card-head .name { font-size: 13.5px; font-weight: 600; color: #e6e6e6; }

.note { font-size: 12.5px; color: #888888; }
.empty { padding: 24px 6px; color: #777777; font-size: 13px; text-align: center; }
.warn {
  padding: 12px 16px;
  background: rgba(220, 80, 80, 0.12);
  border: 1px solid rgba(220, 80, 80, 0.4);
  color: #e88888;
  border-radius: 8px;
  font-size: 13px;
}

/* Tables (Accounts / Workspaces / Palette) */
.table { display: flex; flex-direction: column; border: 1px solid #2b2b2b; border-radius: 10px; overflow: hidden; }
.table-row { display: grid; align-items: center; border-bottom: 1px solid #2a2a2a; }
.table-row:last-child { border-bottom: none; }
.table-row.head {
  background: #1b1b1b;
  color: #777777;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.table-row.body { background: #202020; }
.row-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

.table-accounts .table-row { grid-template-columns: 40px 92px minmax(0, 1fr) auto; gap: 14px; padding: 12px 16px; }
.table-accounts .table-row.head { padding: 10px 16px; }
.profile-name { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; color: #e6e6e6; font-weight: 500; }
.path-cell {
  color: #aaaaaa;
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-row { display: flex; gap: 8px; margin-top: 14px; }
.add-row .input { flex: 1; }

.agent-badge { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.agent-badge svg { width: 18px; height: 18px; }
.agent-badge.claude { background: rgba(78, 201, 176, 0.12); color: #4ec9b0; }
.agent-badge.codex { background: rgba(209, 154, 102, 0.14); color: #d19a66; }

.table-workspaces .table-row { grid-template-columns: 240px 1fr auto; gap: 20px; padding: 16px 20px; }
.table-workspaces .table-row.head { padding: 12px 20px; }
.ws-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ws-badge {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(78, 201, 176, 0.12);
  color: #4ec9b0;
  font-size: 13px;
  font-weight: 700;
}
.ws-name-text { font-size: 13.5px; color: #e6e6e6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.table-palette .table-row { grid-template-columns: 1fr 1.6fr 90px auto; gap: 18px; padding: 13px 18px; }
.table-palette .table-row.head { padding: 11px 18px; }

/* Keybindings */
.kb-card { background: #202020; border: 1px solid #2b2b2b; border-radius: 10px; padding: 18px 20px; }
.kb-card-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.kb-card-name { font-size: 13px; font-weight: 600; color: #e6e6e6; text-transform: uppercase; letter-spacing: 0.05em; }
.kb-count { font-size: 10.5px; color: #777777; background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 20px; padding: 1px 8px; }
.kb-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid #2a2a2a; }
.kb-row:last-child { border-bottom: none; }
.kb-row.conflict { background: rgba(220, 80, 80, 0.07); }
.kb-label { font-size: 12.5px; color: #d4d4d4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-cell {
  font-family: Consolas, "Cascadia Mono", monospace;
  font-size: 11px;
  background: #252525;
  border: 1px solid #333333;
  padding: 5px 8px;
  border-radius: 5px;
  color: #aaaaaa;
  white-space: nowrap;
  cursor: pointer;
}
.key-cell:hover { background: #2a2a2a; }
.key-cell.capturing { background: #1e2f2c; border-color: #4ec9b0; color: #4ec9b0; }
.key-cell.unbound { color: #666666; font-style: italic; }

/* Palette */
.style-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.style-tile {
  border: 1px solid #333333;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #252525;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.style-tile.selected { border-color: #4ec9b0; background: rgba(78, 201, 176, 0.12); }
.style-tile-preview {
  height: 90px;
  border-radius: 6px;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777777;
}
.style-tile-preview svg { width: 54px; height: 54px; }
.style-tile.selected .style-tile-preview { color: #4ec9b0; }
.style-tile-label { display: flex; align-items: center; justify-content: space-between; }
.style-tile-name { font-size: 13px; font-weight: 600; color: #e6e6e6; }
.style-tile-desc { font-size: 11.5px; color: #777777; }
</style>
