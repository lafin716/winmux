<script setup lang="ts">
import { ref } from "vue";
import { useSessions } from "../composables/useSessions";

const { state, setActive, create, kill, rename } = useSessions();

const editingId = ref<string | null>(null);
const editValue = ref("");

function startRename(id: string, name: string) {
  editingId.value = id;
  editValue.value = name;
}

async function commitRename() {
  if (editingId.value && editValue.value.trim()) {
    await rename(editingId.value, editValue.value.trim());
  }
  editingId.value = null;
}

async function closeTab(id: string, ev: MouseEvent) {
  ev.stopPropagation();
  if (confirm("Kill this session?")) {
    await kill(id);
  }
}

async function addTab() {
  await create();
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="(s, i) in state.sessions"
      :key="s.id"
      :class="['tab', { active: s.id === state.activeId }]"
      @click="setActive(s.id)"
      @dblclick="startRename(s.id, s.name)"
    >
      <span class="idx">{{ i }}</span>
      <template v-if="editingId === s.id">
        <input
          v-model="editValue"
          autofocus
          @blur="commitRename"
          @keydown.enter="commitRename"
          @keydown.escape="editingId = null"
          @click.stop
        />
      </template>
      <template v-else>
        <span class="name">{{ s.name }}</span>
      </template>
      <span class="close" @click="closeTab(s.id, $event)">×</span>
    </div>
    <button class="add" @click="addTab">+</button>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  background: #252525;
  border-bottom: 1px solid #111;
  height: 32px;
  user-select: none;
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: #aaa;
  border-right: 1px solid #111;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.tab:hover {
  background: #2e2e2e;
}
.tab.active {
  background: #1e1e1e;
  color: #e6e6e6;
  border-bottom: 2px solid #4ec9b0;
}
.idx {
  opacity: 0.5;
  font-variant-numeric: tabular-nums;
}
.close {
  opacity: 0.4;
  padding: 0 4px;
  border-radius: 3px;
}
.close:hover {
  opacity: 1;
  background: #5a2d2d;
  color: #fff;
}
.add {
  background: transparent;
  border: none;
  color: #888;
  font-size: 18px;
  padding: 0 12px;
  cursor: pointer;
}
.add:hover {
  color: #e6e6e6;
}
input {
  background: #1e1e1e;
  color: #e6e6e6;
  border: 1px solid #4ec9b0;
  font: inherit;
  padding: 0 4px;
  width: 120px;
}
</style>
