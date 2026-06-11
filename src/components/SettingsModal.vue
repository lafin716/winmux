<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useSettings } from "../composables/useSettings";
import { useKeybindings } from "../composables/useKeybindings";
import { useWorkspaces } from "../composables/useWorkspaces";
import { usePrefs } from "../composables/usePrefs";
import {
  captureKeybinding,
  formatKeybinding,
  sameBinding,
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

const { closeSettings } = useSettings();
const { actions, bindingFor, prefixFor, setBinding, resetBinding, resetAll, isOverridden } =
  useKeybindings();
const { items: paletteItems } = usePalette();
const { state: workspaceState, activeWorkspace, updateWorkspaceSettings } = useWorkspaces();
const { prefs, setPref } = usePrefs();

type Category = "terminal" | "workspaces" | "keybindings" | "palette";
const activeCategory = ref<Category>("terminal");

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

async function chooseTerminalProgram(workspaceId?: string) {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Select terminal program",
    filters: [{ name: "Programs", extensions: ["exe", "cmd", "bat", "com"] }],
  });
  if (typeof selected !== "string") return;
  if (workspaceId) {
    updateWorkspaceTerminal(workspaceId, { preset: "custom", program: selected });
  } else {
    updateGlobalTerminal({ preset: "custom", program: selected });
  }
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

function updateWorkspaceArg(id: string, index: number, value: string) {
  const terminal = workspaceTerminal(id);
  if (!terminal) return;
  const args = [...terminal.args];
  args[index] = value;
  updateWorkspaceTerminal(id, { args });
}

function addWorkspaceArg(id: string) {
  const terminal = workspaceTerminal(id);
  if (!terminal) return;
  updateWorkspaceTerminal(id, { args: [...terminal.args, ""] });
}

function removeWorkspaceArg(id: string, index: number) {
  const terminal = workspaceTerminal(id);
  if (!terminal) return;
  updateWorkspaceTerminal(id, {
    args: terminal.args.filter((_, argIndex) => argIndex !== index),
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

function onBackdrop(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) closeSettings();
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
});
onUnmounted(() => {
  window.removeEventListener("keydown", onCaptureKey, true);
  window.removeEventListener("keydown", onEscape);
});

// reference sameBinding so unused-import isn't flagged after a refactor
void sameBinding;
</script>

<template>
  <div class="backdrop" @mousedown="onBackdrop">
    <div class="modal" @mousedown.stop>
      <div class="header">
        <div class="title">Settings</div>
        <button class="close" @click="closeSettings">×</button>
      </div>
      <div class="body">
        <aside class="cats">
          <div
            :class="['cat', { active: activeCategory === 'terminal' }]"
            @click="activeCategory = 'terminal'"
          >
            Terminal
          </div>
          <div
            :class="['cat', { active: activeCategory === 'workspaces' }]"
            @click="activeCategory = 'workspaces'"
          >
            Workspaces
          </div>
          <div
            :class="['cat', { active: activeCategory === 'keybindings' }]"
            @click="activeCategory = 'keybindings'"
          >
            Keybindings
          </div>
          <div
            :class="['cat', { active: activeCategory === 'palette' }]"
            @click="activeCategory = 'palette'"
          >
            Palette
          </div>
        </aside>
        <section class="panel">
          <div v-if="activeCategory === 'terminal'" class="terminal-settings">
            <div class="kb-header">
              <div class="hint">
                Choose the program used by new terminals. Existing sessions are not restarted.
              </div>
            </div>

            <div class="terminal-card">
              <div class="terminal-card-title">Global default</div>
              <label class="field">
                <span>Preset</span>
                <select
                  class="setting-input"
                  :value="prefs.defaultTerminal.preset"
                  @change="applyGlobalPreset(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="preset in TERMINAL_PRESETS" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Program</span>
                <div class="program-row">
                  <input
                    class="setting-input mono"
                    :value="prefs.defaultTerminal.program"
                    placeholder="powershell.exe or C:\path\shell.exe"
                    @input="updateGlobalTerminal({
                      preset: 'custom',
                      program: ($event.target as HTMLInputElement).value,
                    })"
                  />
                  <button class="btn" @click="chooseTerminalProgram()">Browse</button>
                </div>
              </label>
              <div class="field">
                <span>Arguments</span>
                <div class="args">
                  <div
                    v-for="(_, index) in prefs.defaultTerminal.args"
                    :key="index"
                    class="arg-row"
                  >
                    <input
                      class="setting-input mono"
                      :value="prefs.defaultTerminal.args[index]"
                      placeholder="One argument per row"
                      @input="updateGlobalArg(index, ($event.target as HTMLInputElement).value)"
                    />
                    <button class="btn" @click="removeGlobalArg(index)">Remove</button>
                  </div>
                  <button class="btn add-arg" @click="addGlobalArg">+ Add argument</button>
                </div>
              </div>
            </div>

            <div class="terminal-section-title">Workspace overrides</div>
            <div
              v-for="ws in workspaceState.workspaces"
              :key="ws.id"
              class="terminal-card workspace-terminal"
            >
              <label class="override-title">
                <input
                  type="checkbox"
                  :checked="ws.settings?.terminal !== null"
                  @change="setWorkspaceTerminalEnabled(
                    ws.id,
                    ($event.target as HTMLInputElement).checked,
                  )"
                />
                <span>{{ ws.name }}</span>
                <span v-if="ws.id === activeWorkspace?.id" class="active-tag">Active</span>
                <span v-if="ws.settings?.terminal === null" class="inherit-tag">
                  Uses global default
                </span>
              </label>
              <template v-if="ws.settings?.terminal">
                <label class="field">
                  <span>Preset</span>
                  <select
                    class="setting-input"
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
                </label>
                <label class="field">
                  <span>Program</span>
                  <div class="program-row">
                    <input
                      class="setting-input mono"
                      :value="ws.settings.terminal.program"
                      @input="updateWorkspaceTerminal(ws.id, {
                        preset: 'custom',
                        program: ($event.target as HTMLInputElement).value,
                      })"
                    />
                    <button class="btn" @click="chooseTerminalProgram(ws.id)">Browse</button>
                  </div>
                </label>
                <div class="field">
                  <span>Arguments</span>
                  <div class="args">
                    <div
                      v-for="(_, index) in ws.settings.terminal.args"
                      :key="index"
                      class="arg-row"
                    >
                      <input
                        class="setting-input mono"
                        :value="ws.settings.terminal.args[index]"
                        placeholder="One argument per row"
                        @input="updateWorkspaceArg(
                          ws.id,
                          index,
                          ($event.target as HTMLInputElement).value,
                        )"
                      />
                      <button class="btn" @click="removeWorkspaceArg(ws.id, index)">
                        Remove
                      </button>
                    </div>
                    <button class="btn add-arg" @click="addWorkspaceArg(ws.id)">
                      + Add argument
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <div v-else-if="activeCategory === 'workspaces'" class="workspaces">
            <div class="kb-header">
              <div class="hint">
                Set a default folder per workspace. New terminals and splits start in that folder.
              </div>
            </div>
            <div class="table">
              <div class="row ws-head">
                <div>Workspace</div>
                <div>Default folder</div>
                <div></div>
              </div>
              <div v-for="ws in workspaceState.workspaces" :key="ws.id" class="row ws-settings">
                <div class="ws-title">
                  <span class="ws-icon">{{ ws.icon || ws.name.slice(0, 1).toUpperCase() }}</span>
                  <span>{{ ws.name }}</span>
                  <span v-if="ws.id === activeWorkspace?.id" class="active-tag">Active</span>
                </div>
                <input
                  class="path-input"
                  :value="ws.settings?.defaultCwd ?? ''"
                  placeholder="e.g. C:\playground\project"
                  @input="updateDefaultCwd(ws.id, ($event.target as HTMLInputElement).value)"
                />
                <div class="c-actions">
                  <button class="btn" @click="chooseDefaultCwd(ws.id)">Browse</button>
                  <button class="btn" @click="clearDefaultCwd(ws.id)">Clear</button>
                </div>
              </div>
            </div>
            <div class="note">
              Empty means winmux uses the shell/daemon default directory.
            </div>
          </div>

          <div v-else-if="activeCategory === 'keybindings'" class="kb">
            <div class="kb-header">
              <div class="hint">
                Click on a key cell to record a new shortcut. Prefix shortcuts (Ctrl+B …) are fixed in this version.
              </div>
              <button class="reset-all" @click="resetAll">Reset all</button>
            </div>
            <div class="table">
              <div class="row head">
                <div class="c-name">Action</div>
                <div class="c-key">Key</div>
                <div class="c-actions"></div>
              </div>
              <div
                v-for="a in actions"
                :key="a.id"
                :class="['row', { conflict: hasConflict(a.id as ActionId) }]"
              >
                <div class="c-name">
                  {{ a.label }}
                  <span class="cat-tag">{{ a.category }}</span>
                </div>
                <div
                  :class="['c-key', 'key-cell', {
                    capturing: capturingId === a.id,
                    unbound: isUnbound(bindingFor(a.id as ActionId)) && !prefixFor(a.id as ActionId),
                  }]"
                  @click="capturingId === a.id ? cancelCapture() : startCapture(a.id as ActionId)"
                >
                  {{ displayBinding(a.id as ActionId) }}
                </div>
                <div class="c-actions">
                  <button
                    class="btn"
                    :disabled="!isOverridden(a.id as ActionId)"
                    @click="resetBinding(a.id as ActionId)"
                    title="Reset to default"
                  >Reset</button>
                  <button
                    class="btn"
                    @click="clearBinding(a.id as ActionId)"
                    title="Clear (disable global shortcut)"
                  >Clear</button>
                </div>
              </div>
            </div>
            <div v-if="conflicts.size > 0" class="warn">
              ⚠ Conflicting shortcuts detected. Only one action will be triggered per keystroke.
            </div>
          </div>

          <div v-else-if="activeCategory === 'palette'" class="palette">
            <div class="kb-header">
              <div class="hint">
                Items appear in the radial menu opened by middle-clicking inside a terminal. "Auto-run" appends Enter; otherwise the command is pasted at the prompt.
              </div>
              <button class="reset-all" @click="addPaletteRow">+ Add item</button>
            </div>
            <div class="table">
              <div class="row pal head">
                <div>Label</div>
                <div>Command</div>
                <div>Auto-run</div>
                <div></div>
              </div>
              <div v-for="it in paletteItems" :key="it.id" class="row pal">
                <input
                  class="pal-input"
                  :value="it.label"
                  maxlength="40"
                  @input="updatePaletteItem(it.id, { label: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="pal-input mono"
                  :value="it.command"
                  @input="updatePaletteItem(it.id, { command: ($event.target as HTMLInputElement).value })"
                />
                <label class="pal-check">
                  <input
                    type="checkbox"
                    :checked="it.autoRun"
                    @change="updatePaletteItem(it.id, { autoRun: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
                <div class="c-actions">
                  <button class="btn" @click="removePaletteItem(it.id)">Remove</button>
                </div>
              </div>
              <div v-if="paletteItems.length === 0" class="empty">
                No custom items yet. Click <b>+ Add item</b> to create one.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 720px;
  height: 520px;
  background: #1e1e1e;
  border: 1px solid #111;
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  color: #d4d4d4;
  font-size: 13px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #111;
}
.title { font-weight: 600; }
.close {
  background: transparent;
  color: #aaa;
  border: none;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}
.close:hover { color: #fff; }
.body { display: flex; flex: 1; min-height: 0; }
.cats {
  width: 160px;
  background: #1b1b1b;
  border-right: 1px solid #111;
  padding: 8px 0;
}
.cat {
  padding: 8px 14px;
  cursor: pointer;
}
.cat:hover { background: #252525; }
.cat.active {
  background: #2a2a2a;
  color: #4ec9b0;
}
.panel {
  flex: 1;
  padding: 12px 16px;
  overflow: auto;
}
.kb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.hint { color: #888; font-size: 12px; max-width: 420px; }
.reset-all {
  background: #2a2a2a;
  color: #d4d4d4;
  border: 1px solid #333;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
}
.reset-all:hover { background: #333; }
.table { display: flex; flex-direction: column; }
.row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 160px;
  gap: 8px;
  padding: 8px 6px;
  border-bottom: 1px solid #232323;
  align-items: center;
}
.row.head {
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #111;
}
.row.conflict {
  background: rgba(220, 80, 80, 0.07);
}
.c-name { display: flex; align-items: center; gap: 8px; }
.cat-tag {
  font-size: 10px;
  color: #777;
  background: #252525;
  padding: 1px 6px;
  border-radius: 8px;
  text-transform: uppercase;
}
.key-cell {
  font-family: Consolas, "Cascadia Mono", monospace;
  background: #252525;
  border: 1px solid #2a2a2a;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  min-height: 24px;
  display: flex;
  align-items: center;
}
.key-cell:hover { background: #2a2a2a; }
.key-cell.capturing {
  background: #1e2f2c;
  border-color: #4ec9b0;
  color: #4ec9b0;
}
.key-cell.unbound { color: #666; font-style: italic; }
.c-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.btn {
  background: #2a2a2a;
  color: #d4d4d4;
  border: 1px solid #333;
  padding: 3px 10px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
}
.btn:hover:not(:disabled) { background: #333; }
.btn:disabled { color: #555; cursor: not-allowed; }
.warn {
  margin-top: 12px;
  padding: 8px 10px;
  background: rgba(220, 80, 80, 0.12);
  border: 1px solid rgba(220, 80, 80, 0.4);
  color: #e88;
  border-radius: 4px;
  font-size: 12px;
}
.row.pal {
  grid-template-columns: 1fr 1.4fr 80px 100px;
}
.row.ws-head,
.row.ws-settings {
  grid-template-columns: 140px 1fr 130px;
}
.ws-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.ws-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: #2a2a2a;
  color: #4ec9b0;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.active-tag {
  color: #4ec9b0;
  background: rgba(78, 201, 176, 0.12);
  border: 1px solid rgba(78, 201, 176, 0.25);
  border-radius: 8px;
  padding: 1px 6px;
  font-size: 10px;
}
.path-input {
  background: #252525;
  color: #e6e6e6;
  border: 1px solid #2a2a2a;
  padding: 4px 8px;
  border-radius: 3px;
  font: inherit;
  font-family: Consolas, "Cascadia Mono", monospace;
  min-width: 0;
}
.path-input:focus {
  outline: none;
  border-color: #4ec9b0;
}
.note {
  margin-top: 10px;
  color: #888;
  font-size: 12px;
}
.terminal-card {
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #2b2b2b;
  border-radius: 5px;
  background: #202020;
}
.terminal-card-title,
.terminal-section-title {
  margin-bottom: 10px;
  font-weight: 600;
  color: #e6e6e6;
}
.terminal-section-title {
  margin-top: 16px;
}
.workspace-terminal {
  padding-top: 10px;
}
.override-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  font-weight: 600;
}
.inherit-tag {
  margin-left: auto;
  color: #777;
  font-size: 11px;
  font-weight: 400;
}
.field {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 9px;
  color: #aaa;
  font-size: 12px;
}
.field > span {
  padding-top: 5px;
}
.setting-input {
  width: 100%;
  min-width: 0;
  padding: 5px 7px;
  color: #e6e6e6;
  background: #252525;
  border: 1px solid #333;
  border-radius: 3px;
  font: inherit;
}
.setting-input:focus {
  outline: none;
  border-color: #4ec9b0;
}
.mono {
  font-family: Consolas, "Cascadia Mono", monospace;
}
.program-row,
.arg-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.args {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.add-arg {
  align-self: flex-start;
}
.pal-input {
  background: #252525;
  color: #e6e6e6;
  border: 1px solid #2a2a2a;
  padding: 4px 8px;
  border-radius: 3px;
  font: inherit;
}
.pal-input.mono {
  font-family: Consolas, "Cascadia Mono", monospace;
}
.pal-input:focus {
  outline: none;
  border-color: #4ec9b0;
}
.pal-check {
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty {
  padding: 16px 6px;
  color: #777;
  font-size: 12px;
  text-align: center;
}
</style>
