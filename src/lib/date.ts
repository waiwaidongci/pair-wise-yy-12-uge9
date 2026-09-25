/** 按 UTC 解析 yyyy-mm-dd，避免本地时区造成日期漂移 */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** 日期相差天数：a - b（按日历天） */
export function diffDays(a: string, b: string): number {
  const ms = parseDate(a).getTime() - parseDate(b).getTime();
  return Math.round(ms / 86400000);
}

/** 上次装蹄至基准日经过的天数；无记录返回 null */
export function daysSinceShoeing(lastShoeDate: string | null, base: string): number | null {
  if (!lastShoeDate) return null;
  return diffDays(base, lastShoeDate);
}

/** 复查到期紧迫度 */
export function dueState(checkupDue: string | null, base: string): import("../types").DueState {
  if (!checkupDue) return "none";
  const delta = diffDays(checkupDue, base);
  if (delta < 0) return "overdue";
  if (delta <= 3) return "due";
  return "later";
}

export function dueLabel(checkupDue: string | null, base: string): string {
  if (!checkupDue) return "无复查计划";
  const delta = diffDays(checkupDue, base);
  if (delta < 0) return `已逾期 ${-delta} 天（${checkupDue}）`;
  if (delta === 0) return `今天到期（${checkupDue}）`;
  return `还剩 ${delta} 天（${checkupDue}）`;
}
