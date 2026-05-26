<script setup lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onMounted } from "vue";
import TabBar from "./components/TabBar.vue";
import StatusBar from "./components/StatusBar.vue";
import TerminalView from "./components/Terminal.vue";
import { useSessions } from "./composables/useSessions";
import { usePrefixKey } from "./composables/usePrefixKey";

type TerminalRef = InstanceType<typeof TerminalView> & {
  focus: () => void;
  fit: () => void;
  reset: () => void;
};

const termRefs = new Map<string, TerminalRef>();
function setTermRef(id: string, el: unknown) {
  if (el) termRefs.set(id, el as TerminalRef);
  else termRefs.delete(id);
}

const {
  state,
  active,
  refresh,
  create,
  kill,
  next,
  prev,
  selectByIndex,
  rename,
} = useSessions();

async function bootstrap() {
  await refresh();
  if (state.sessions.length === 0) {
    await create();
  } else if (!state.activeId) {
    state.activeId = state.sessions[0].id;
  }
}

async function promptRename() {
  if (!active.value) return;
  const name = window.prompt("Rename session", active.value.name);
  if (name && name.trim()) await rename(active.value.id, name.trim());
}

async function killActive() {
  if (!active.value) return;
  if (confirm(`Kill session "${active.value.name}"?`)) {
    await kill(active.value.id);
    if (state.sessions.length === 0) await create();
  }
}

async function detach() {
  const w = getCurrentWebviewWindow();
  await w.hide();
}

usePrefixKey(async (key) => {
  switch (key) {
    case "c":
      await create();
      break;
    case "n":
      next();
      break;
    case "p":
      prev();
      break;
    case ",":
      await promptRename();
      break;
    case "&":
      await killActive();
      break;
    case "d":
      await detach();
      break;
    case "r":
      if (active.value) termRefs.get(active.value.id)?.reset();
      break;
    default:
      if (/^[0-9]$/.test(key)) selectByIndex(parseInt(key, 10));
  }
});

onMounted(bootstrap);
</script>

<template>
  <div class="app">
    <TabBar />
    <div class="terminals">
      <TerminalView
        v-for="s in state.sessions"
        :key="s.id"
        :ref="(el) => setTermRef(s.id, el)"
        :session-id="s.id"
        :active="s.id === state.activeId"
        v-show="s.id === state.activeId"
      />
      <div v-if="state.sessions.length === 0" class="empty">
        No sessions. Press <kbd>Ctrl+B</kbd> then <kbd>c</kbd> to create one.
      </div>
    </div>
    <StatusBar />
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
.terminals {
  flex: 1;
  position: relative;
  min-height: 0;
  background: #1e1e1e;
}
.terminals > :deep(.term-host) {
  position: absolute;
  inset: 0;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
}
kbd {
  background: #2e2e2e;
  border: 1px solid #444;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: Consolas, monospace;
}
</style>
