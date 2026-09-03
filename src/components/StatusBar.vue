<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useSessions, displayName } from "../composables/useSessions";
import { useWorkspaces } from "../composables/useWorkspaces";
import { useUsage } from "../composables/useUsage";
import { CLI_AGENTS } from "../composables/useAccountProfiles";
import { sessionAgentIcon } from "../lib/session-agent-icon";
import { formatUsagePercent, formatUsageReset } from "../lib/usage-status";

const { focusedSession } = useSessions();
const { activeWorkspace } = useWorkspaces();
const { usage } = useUsage();

const time = ref(formatNow());
let timer: number | null = null;

function formatNow() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    <div class="usage">
      <span
        v-for="agentDef in CLI_AGENTS"
        :key="agentDef.id"
        class="usage-item"
        :title="`${agentDef.label} 사용량 · 아직 연동되지 않음`"
      >
        <Icon
          :class="['usage-ico', `agent-${agentDef.id}`]"
          :icon="sessionAgentIcon(agentDef.id)"
        />
        <span class="usage-pct">{{ formatUsagePercent(usage[agentDef.id]) }}</span>
        <span class="usage-reset">{{ formatUsageReset(usage[agentDef.id]) }}</span>
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
.usage {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 0 12px;
  overflow: hidden;
  align-items: center;
}
.badge {
  font-weight: bold;
}
.ws { font-weight: 600; }
.usage-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  opacity: 0.9;
  white-space: nowrap;
}
.usage-ico {
  flex-shrink: 0;
  font-size: 13px;
}
.usage-ico.agent-codex {
  font-size: 15px;
}
.usage-pct {
  font-weight: 700;
}
.usage-reset {
  font-size: 11px;
  opacity: 0.75;
}
</style>
