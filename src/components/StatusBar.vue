<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useSessions, displayName } from "../composables/useSessions";
import { useWorkspaces } from "../composables/useWorkspaces";

const { workspaceSessions, focusedSession } = useSessions();
const { activeWorkspace } = useWorkspaces();
const time = ref(formatNow());
let timer: number | null = null;

function formatNow() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sessionLabel(i: number): string {
  if (i < 9) return String(i + 1);
  if (i < 15) return String.fromCharCode(65 + (i - 9));
  return String(i + 1);
}

onMounted(() => {
  timer = window.setInterval(() => {
    time.value = formatNow();
  }, 30_000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <div class="status-bar">
    <div class="left">
      <span class="badge">[winmux]</span>
      <span v-if="activeWorkspace" class="ws">{{ activeWorkspace.name }}</span>
      <span v-if="focusedSession">/ {{ displayName(focusedSession.name) }}</span>
    </div>
    <div class="center">
      <span v-for="(s, i) in workspaceSessions" :key="s.id"
            :class="['win', { active: focusedSession?.id === s.id }]">
        {{ sessionLabel(i) }}:{{ displayName(s.name) }}
      </span>
    </div>
    <div class="right">
      <span>{{ time }}</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  background: #4ec9b0;
  color: #1a1a1a;
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  font-family: Consolas, "Cascadia Mono", monospace;
  user-select: none;
}
.left, .right {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  align-items: center;
}
.center {
  flex: 1;
  display: flex;
  gap: 10px;
  padding: 0 12px;
  overflow: hidden;
}
.badge {
  font-weight: bold;
}
.ws { font-weight: 600; }
.win { opacity: 0.7; }
.win.active {
  background: #1a1a1a;
  color: #4ec9b0;
  padding: 0 6px;
  opacity: 1;
}
</style>
