import type {
  Horse,
  OrderStatus,
  PlanSnapshot,
  RejectReasonCode,
  RouteEntry,
  ScheduleDecision,
  ScheduleResult,
  VisitOrder,
} from "../types";
import { daysSinceShoeing, diffDays } from "./date";

/** 业务规则常量：复查/加急间隔与马房容量都集中在这里，便于核对口径 */
export const MIN_DAYS_AFTER_SHOEING = 14;
export const MAX_HORSES_PER_STABLE_PER_DAY = 2;

export const REJECT_TEXT: Record<RejectReasonCode, string> = {
  NO_RECORD: "缺少蹄铁记录，暂不排入",
  TOO_SOON: `上次装蹄未满 ${MIN_DAYS_AFTER_SHOEING} 天，暂不排入`,
  STABLE_FULL: `马房当日名额已满（每日最多 ${MAX_HORSES_PER_STABLE_PER_DAY} 匹）`,
};

export interface SchedulingContext {
  date: string;
  horses: Horse[];
  /** 参与排程的候选单（通常是全部「待排」的未完成单） */
  orders: VisitOrder[];
  /**
   * 已占用该日马房名额的站点（例如沿用中的已排单）。
   * 同一马房计数达到上限后，新单只能被判定为名额已满。
   */
  occupied?: RouteEntry[];
}

/**
 * 马匹是否具备排入资格。
 * 规则：缺少蹄铁记录（上次装蹄日期为空）→ 不排；上次装蹄未满 14 天 → 不排。
 * 加急单同样受这两条资格约束，只是在占坑顺序上排在普通单之后。
 */
export function evaluateHorse(
  horse: Horse,
  date: string
): { eligible: boolean; reasonCode: RejectReasonCode | null } {
  const elapsed = daysSinceShoeing(horse.lastShoeDate, date);
  if (elapsed === null) return { eligible: false, reasonCode: "NO_RECORD" };
  if (elapsed < MIN_DAYS_AFTER_SHOEING) return { eligible: false, reasonCode: "TOO_SOON" };
  return { eligible: true, reasonCode: null };
}

/** 同一匹马是否已存在未完成（待排/已排）巡诊单 */
export function hasOpenOrder(orders: VisitOrder[], horseId: string, excludeId?: string): boolean {
  return orders.some(
    (o) =>
      o.horseId === horseId &&
      o.id !== excludeId &&
      (o.status === "pending" || o.status === "scheduled")
  );
}

function byDueThenShoeThenId(a: Horse, b: Horse): number {
  const da = a.checkupDue ? diffDays(a.checkupDue, "1970-01-01") : Number.MAX_SAFE_INTEGER;
  const db = b.checkupDue ? diffDays(b.checkupDue, "1970-01-01") : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  const sa = a.lastShoeDate ?? "9999-12-31";
  const sb = b.lastShoeDate ?? "9999-12-31";
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * 排程核心判定（纯函数）：
 * 1. 先做资格判定（缺记录 / 未满 14 天，立即出局）；
 * 2. 普通复查单按复查到期优先占名额；
 * 3. 加急单只能占用各马房剩余位置；
 * 4. 同马房当天最多两匹马。
 */
export function scheduleVisits(ctx: SchedulingContext): ScheduleResult {
  const horseMap = new Map(ctx.horses.map((h) => [h.id, h]));
  const decisions: ScheduleDecision[] = [];
  const placed: Array<{ order: VisitOrder; horse: Horse }> = [];
  const used = new Map<string, number>();

  for (const entry of ctx.occupied ?? []) {
    const horse = horseMap.get(entry.horseId);
    if (horse) used.set(horse.stable, (used.get(horse.stable) ?? 0) + 1);
  }

  // 候选单按优先级分桶；资格判定对两桶都生效
  const buckets: Record<"normal" | "urgent", VisitOrder[]> = { normal: [], urgent: [] };
  for (const order of ctx.orders) {
    const horse = horseMap.get(order.horseId);
    if (!horse) continue;
    const check = evaluateHorse(horse, ctx.date);
    if (!check.eligible) {
      decisions.push({
        orderId: order.id,
        horseId: horse.id,
        stable: horse.stable,
        priority: order.priority,
        placed: false,
        reasonCode: check.reasonCode,
        reasonText: REJECT_TEXT[check.reasonCode as RejectReasonCode],
      });
      continue;
    }
    buckets[order.priority].push(order);
  }

  const sortOrders = (list: VisitOrder[]) =>
    list
      .map((o) => ({ order: o, horse: horseMap.get(o.horseId)! }))
      .sort((a, b) => byDueThenShoeThenId(a.horse, b.horse));

  // 先普通单占坑，再用加急单填充剩余位置
  for (const item of [...sortOrders(buckets.normal), ...sortOrders(buckets.urgent)]) {
    const { order, horse } = item;
    const count = used.get(horse.stable) ?? 0;
    if (count >= MAX_HORSES_PER_STABLE_PER_DAY) {
      decisions.push({
        orderId: order.id,
        horseId: horse.id,
        stable: horse.stable,
        priority: order.priority,
        placed: false,
        reasonCode: "STABLE_FULL",
        reasonText: REJECT_TEXT.STABLE_FULL,
      });
      continue;
    }
    used.set(horse.stable, count + 1);
    placed.push(item);
    decisions.push({
      orderId: order.id,
      horseId: horse.id,
      stable: horse.stable,
      priority: order.priority,
      placed: true,
      reasonCode: null,
      reasonText: "",
    });
  }

  // 路线排序：马房按复查到期最紧的在前，马房内同样按到期先后
  const byStable = new Map<string, Array<{ order: VisitOrder; horse: Horse }>>();
  for (const item of placed) {
    const list = byStable.get(item.horse.stable) ?? [];
    list.push(item);
    byStable.set(item.horse.stable, list);
  }
  const stableEarliest = new Map<string, number>();
  for (const [stable, list] of byStable) {
    stableEarliest.set(
      stable,
      Math.min(...list.map(({ horse }) => (horse.checkupDue ? diffDays(horse.checkupDue, "1970-01-01") : Number.MAX_SAFE_INTEGER)))
    );
    list.sort((a, b) => byDueThenShoeThenId(a.horse, b.horse));
  }

  let globalSeq = 1;
  const routes = [...byStable.keys()]
    .sort((a, b) => (stableEarliest.get(a)! - stableEarliest.get(b)!) || a.localeCompare(b))
    .map((stable) => ({
      stable,
      entries: byStable.get(stable)!.map<RouteEntry>(({ order, horse }, idx) => ({
        orderId: order.id,
        horseId: horse.id,
        seq: globalSeq++,
        stableSeq: idx + 1,
      })),
    }));

  const capacity = [...used.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((stable) => ({
      stable,
      used: used.get(stable)!,
      capacity: MAX_HORSES_PER_STABLE_PER_DAY,
    }));

  return { date: ctx.date, decisions, routes, capacity };
}

/** 已归档排程中某匹马是否已在该日路线上（用于占用名额计算） */
export function occupiedFromPlans(plans: PlanSnapshot[], date: string): RouteEntry[] {
  const plan = plans.find((p) => p.date === date);
  return plan ? plan.routes.flatMap((r) => r.entries) : [];
}

/** 某状态是否属于「未完成」（待排 + 已排） */
export function isOpenStatus(status: OrderStatus): boolean {
  return status === "pending" || status === "scheduled";
}
