<script setup lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onMounted } from "vue";
import SideBar from "./components/SideBar.vue";
import StatusBar from "./components/StatusBar.vue";
import SplitContainer from "./components/SplitContainer.vue";
import MenuBar from "./components/MenuBar.vue";
import SettingsModal from "./components/SettingsModal.vue";
import { api } from "./lib/tauri";
import { useSessions } from "./composables/useSessions";
import { useWorkspaces, loadFromStorage } from "./composables/useWorkspaces";
import { useFocus } from "./composables/useFocus";
import { usePrefixKey } from "./composables/usePrefixKey";
import { useKeybindings, loadKeybindingsFromStorage } from "./composables/useKeybindings";
import { useGlobalShortcuts, registerAction } from "./composables/useGlobalShortcuts";
import { useSettings } from "./composables/useSettings";
import { ACTIONS, type ActionId } from "./lib/keybindings";
import {
  addTabToLeaf,
  collectAllLeaves,
  collectAllSessionIds,
  findFirstLeaf,
  findLeafById,
  pruneMissing,
  splitLeaf,
} from "./composables/useLayout";

const { state: sessState, refresh, create, kill, focusedSession, rename } = useSessions();
const { activeWorkspace, replaceLayout, state: wsState } = useWorkspaces();
const { focusedLeafId, setFocusedLeaf } = useFocus();
const { settingsOpen, openSettings } = useSettings();
const { prefixFor } = useKeybindings();
useGlobalShortcuts();

async function bootstrap() {
  loadKeybindingsFromStorage();
  loadFromStorage();
  await refresh();

  // Prune missing sessions from every workspace layout.
  const validIds = new Set(sessState.sessions.map((s) => s.id));
  for (const ws of wsState.workspaces) {
    const newRoot = pruneMissing(ws.layout, validIds);
    if (newRoot !== ws.layout) replaceLayout(ws.id, newRoot);
  }

  // Attach orphan sessions (in daemon but not in any layout) to the active workspace's first leaf.
  const placed = new Set<string>();
  for (const ws of wsState.workspaces) {
    for (const sid of collectAllSessionIds(ws.layout)) placed.add(sid);
  }
  const ws = activeWorkspace.value;
  if (ws) {
    const leaf = findFirstLeaf(ws.layout);
    for (const s of sessState.sessions) {
      if (!placed.has(s.id)) addTabToLeaf(ws.layout, leaf.id, s.id);
    }
    // Set initial focus to the first non-empty leaf with an active tab.
    const firstLeafWithTabs = collectAllLeaves(ws.layout).find((l) => l.tabs.length > 0);
    if (firstLeafWithTabs) {
      setFocusedLeaf(firstLeafWithTabs.id);
      if (!firstLeafWithTabs.activeTabId) {
        firstLeafWithTabs.activeTabId = firstLeafWithTabs.tabs[0];
      }
    } else {
      setFocusedLeaf(leaf.id);
    }
  }

  // Ensure at least one session exists.
  if (sessState.sessions.length === 0) {
    await create();
  }
}

async function promptRename() {
  const s = focusedSession.value;
  if (!s) return;
  const name = window.prompt("Rename session", s.name);
  if (name && name.trim()) await rename(s.id, name.trim());
}

async function killFocused() {
  const s = focusedSession.value;
  if (!s) return;
  if (confirm(`Kill session "${s.name}"?`)) {
    await kill(s.id);
    if (sessState.sessions.length === 0) await create();
  }
}

async function detach() {
  const w = getCurrentWebviewWindow();
  await w.hide();
}

function cycleInLeaf(delta: number) {
  const ws = activeWorkspace.value;
  if (!ws || !focusedLeafId.value) return;
  const leaf = findLeafById(ws.layout, focusedLeafId.value);
  if (!leaf || leaf.tabs.length < 2 || !leaf.activeTabId) return;
  const idx = leaf.tabs.indexOf(leaf.activeTabId);
  const n = leaf.tabs[(idx + delta + leaf.tabs.length) % leaf.tabs.length];
  leaf.activeTabId = n;
}

function selectByIndexInLeaf(i: number) {
  const ws = activeWorkspace.value;
  if (!ws || !focusedLeafId.value) return;
  const leaf = findLeafById(ws.layout, focusedLeafId.value);
  if (!leaf) return;
  const tab = leaf.tabs[i];
  if (tab) leaf.activeTabId = tab;
}

async function splitAndCreate(direction: "horizontal" | "vertical") {
  const ws = activeWorkspace.value;
  if (!ws || !focusedLeafId.value) return;
  const info = await api.createSession({});
  sessState.sessions.push(info);
  const newRoot = splitLeaf(ws.layout, focusedLeafId.value, info.id, direction, "after");
  if (newRoot !== ws.layout) replaceLayout(ws.id, newRoot);
}

const ACTION_HANDLERS: Record<ActionId, () => void | Promise<void>> = {
  "session.new": async () => { await create(); },
  "session.kill": () => killFocused(),
  "session.rename": () => promptRename(),
  "session.cycleNext": () => cycleInLeaf(1),
  "session.cyclePrev": () => cycleInLeaf(-1),
  "pane.splitHorizontal": () => splitAndCreate("horizontal"),
  "pane.splitVertical": () => splitAndCreate("vertical"),
  "window.detach": () => detach(),
  "settings.open": () => openSettings(),
};

for (const a of ACTIONS) {
  const h = ACTION_HANDLERS[a.id as ActionId];
  if (h) registerAction(a.id as ActionId, h);
}

usePrefixKey(async (key) => {
  // Numeric tab selection is hard-wired (not a configurable action).
  if (/^[0-9]$/.test(key)) {
    selectByIndexInLeaf(parseInt(key, 10));
    return;
  }
  for (const a of ACTIONS) {
    if (prefixFor(a.id as ActionId) === key) {
      const h = ACTION_HANDLERS[a.id as ActionId];
      if (h) await h();
      return;
    }
  }
});

onMounted(bootstrap);
</script>

<template>
  <div class="app">
    <MenuBar />
    <div class="main">
      <SideBar />
      <div class="content">
        <SplitContainer v-if="activeWorkspace" :key="activeWorkspace.id" :node="activeWorkspace.layout" />
      </div>
    </div>
    <StatusBar />
    <SettingsModal v-if="settingsOpen" />
  </div>
</template>

<style>
html, body, #app {
  margin: 0;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: Inter, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}
.main {
  display: flex;
  flex: 1;
  min-height: 0;
}
.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: #1e1e1e;
}
</style>
