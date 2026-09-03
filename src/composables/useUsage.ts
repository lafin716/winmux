import { reactive } from "vue";
import type { CliAgentKind } from "../lib/persistence";
import type { UsageStat } from "../lib/usage-status";

/**
 * Claude/Codex usage-limit stats shown in the StatusBar usage strip.
 *
 * There is no data source wired in yet: neither service exposes a public or
 * local-cache API for a Pro/Max or Plus/Pro *subscription's* usage
 * percentage — only pay-as-you-go API-key rate limits are queryable that
 * way, which is a different number from what a `claude`/`codex` session
 * logged in via the CLI actually runs against. Reading the CLIs' own OAuth
 * credential files to hit their undocumented internal endpoints isn't
 * something to build blind either. So every agent starts, and stays, at
 * `{ percentUsed: null, resetsAt: null }` until a real source shows up —
 * `usage-status.ts` already renders that as "not connected".
 */
const usage = reactive<Record<CliAgentKind, UsageStat>>({
  claude: { percentUsed: null, resetsAt: null },
  codex: { percentUsed: null, resetsAt: null },
});

export function useUsage() {
  return { usage };
}
