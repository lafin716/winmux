/**
 * Formatting for the Claude/Codex usage strip in the status bar.
 *
 * There is no live data source wired in yet (see `useUsage.ts` for why), so
 * every stat currently arrives as `{ percentUsed: null, resetsAt: null }`
 * and these always render the "not connected" copy. The functions are still
 * real formatting logic rather than placeholders, so plugging in a future
 * data source is a matter of populating `useUsage`'s state — the display
 * code doesn't change.
 */
export interface UsageStat {
  /** 0-100, or `null` when no data source is connected yet. */
  percentUsed: number | null;
  /** Epoch ms when the limit is expected to reset, or `null` when unknown. */
  resetsAt: number | null;
}

export function formatUsagePercent(stat: UsageStat): string {
  if (stat.percentUsed === null) return "—%";
  const clamped = Math.min(100, Math.max(0, stat.percentUsed));
  return `${Math.round(clamped)}%`;
}

export function formatUsageReset(stat: UsageStat, now: number = Date.now()): string {
  if (stat.resetsAt === null) return "연동 필요";
  const diffMs = stat.resetsAt - now;
  if (diffMs <= 0) return "초기화됨";
  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 초기화`;
  return `${minutes}분 후 초기화`;
}
