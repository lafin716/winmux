<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Icon, type IconifyIcon } from "@iconify/vue";
import { useQuickOpen } from "../composables/useQuickOpen";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useSessions } from "../composables/useSessions";
import { useFocus } from "../composables/useFocus";
import { usePalette } from "../composables/usePalette";
import { activateSessionTab } from "../composables/useLayout";
import {
  rankQuickOpen,
  workspaceCandidates,
  sessionCandidates,
  commandCandidates,
  type QuickOpenCandidate,
  type QuickOpenResult,
  type QuickOpenKind,
} from "../lib/quick-open";
import {
  workspaceIcon,
  terminalIcon,
  commandIcon,
  fileIcon,
} from "../lib/offline-icons";
import { api, stringToBase64 } from "../lib/tauri";

const { state, close, setQuery, moveSelection, setSelectedIndex } = useQuickOpen();
const { state: wsState, activeWorkspace, setActiveWorkspace } = useWorkspaces();
const { workspaceSessions, focusedSession } = useSessions();
const { setFocusedLeaf } = useFocus();
const { items } = usePalette();

const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const KIND_ICONS: Record<QuickOpenKind, IconifyIcon> = {
  workspace: workspaceIcon,
  session: terminalIcon,
  command: commandIcon,
  file: fileIcon,
};

// Candidate arrays are built from the live sources; ranking, the empty-query
// rule and the per-kind cap all live in the pure `quick-open` seam.
const candidates = computed<QuickOpenCandidate[]>(() => [
  ...workspaceCandidates(wsState.workspaces),
  ...sessionCandidates(workspaceSessions.value),
  ...commandCandidates(items),
]);

const results = computed<QuickOpenResult[]>(() =>
  rankQuickOpen(candidates.value, state.query),
);

function onInput(ev: Event) {
  setQuery((ev.target as HTMLInputElement).value);
}

async function scrollSelectedIntoView() {
  await nextTick();
  listEl.value
    ?.querySelector<HTMLElement>(".qo-result.active")
    ?.scrollIntoView({ block: "nearest" });
}

async function act(result: QuickOpenResult | undefined) {
  if (result) {
    switch (result.kind) {
      case "workspace":
        setActiveWorkspace(result.id);
        break;
      case "session": {
        const ws = activeWorkspace.value;
        const leafId = ws ? activateSessionTab(ws.layout, result.id) : null;
        if (leafId) setFocusedLeaf(leafId);
        break;
      }
      case "command": {
        const item = items.find((it) => it.id === result.id);
        const sid = focusedSession.value?.id;
        // No focused Session → acting on a Command is a no-op (still closes).
        if (item && sid) {
          const text = item.command + (item.autoRun ? "\r" : "");
          if (text) {
            try {
              await api.writeSession(sid, stringToBase64(text));
            } catch (e) {
              console.warn("writeSession failed", e);
            }
          }
        }
        break;
      }
      case "file":
        // File source arrives in a later ticket; nothing to open yet.
        break;
    }
  }
  close();
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    moveSelection(1, results.value.length);
    void scrollSelectedIntoView();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    moveSelection(-1, results.value.length);
    void scrollSelectedIntoView();
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    void act(results.value[state.selectedIndex]);
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    close();
  }
}

// Auto-focus the text field each time the overlay opens.
watch(
  () => state.open,
  async (isOpen) => {
    if (!isOpen) return;
    await nextTick();
    inputEl.value?.focus();
  },
);
</script>

<template>
  <div v-if="state.open" class="qo-backdrop" @mousedown.self="close">
    <div class="qo-panel" role="dialog" aria-label="Quick Open">
      <input
        ref="inputEl"
        class="qo-input"
        type="text"
        :value="state.query"
        placeholder="Search workspaces, sessions, commands…"
        spellcheck="false"
        autocomplete="off"
        @input="onInput"
        @keydown="onKeydown"
      />
      <ul v-if="results.length" ref="listEl" class="qo-list" role="listbox">
        <li
          v-for="(result, i) in results"
          :key="result.kind + ':' + result.id"
          class="qo-result"
          :class="{ active: i === state.selectedIndex }"
          role="option"
          :aria-selected="i === state.selectedIndex"
          @mouseenter="setSelectedIndex(i)"
          @click="act(result)"
        >
          <Icon class="qo-icon" :icon="KIND_ICONS[result.kind]" />
          <span class="qo-label">{{ result.label }}</span>
          <span v-if="result.subtitle" class="qo-subtitle">{{ result.subtitle }}</span>
          <span class="qo-kind">{{ result.kind }}</span>
        </li>
      </ul>
      <div v-else class="qo-empty">No matches</div>
    </div>
  </div>
</template>

<style scoped>
.qo-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.35);
}
.qo-panel {
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: 70vh;
  overflow: hidden;
  background: #252525;
  border: 1px solid #111;
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}
.qo-input {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 12px;
  color: #f0f0f0;
  font-size: 14px;
  background: #1e1e1e;
  border: 0;
  border-bottom: 1px solid #111;
  outline: none;
}
.qo-input::placeholder {
  color: #777;
}
.qo-list {
  flex: 1 1 auto;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
}
.qo-result {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 10px;
  color: #d4d4d4;
  border-radius: 3px;
  cursor: pointer;
}
.qo-result.active {
  color: #fff;
  background: #094771;
}
.qo-icon {
  flex: 0 0 16px;
  font-size: 16px;
  color: #4ec9b0;
}
.qo-label {
  flex: 0 1 auto;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qo-subtitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  color: #888;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qo-kind {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 8px;
  font-size: 10px;
  color: #6a6a6a;
  text-transform: capitalize;
}
.qo-empty {
  padding: 16px 12px;
  color: #888;
  font-size: 13px;
  text-align: center;
}
</style>
