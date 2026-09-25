// 排程判定：纯函数模块，只负责“能不能排、排第几、为什么不排”
// 规则：
// 1. 仅处理未完成且尚未排入其它日期的巡诊单；
// 2. 上次装蹄未满 14 天，或缺少蹄铁记录的马，不排入；
// 3. 加急单只占用马房剩余位置：每个马房每天最多两匹，常规复查到期马先排，
//    排完常规后加急单再补剩余槽位，加急单不能挤掉常规马。

import type {
  FilledAs,
  Horse,
  Plan,
  PlanEntry,
  PlanSkipped,
  SheetKind,
  VisitSheet,
} from "../archive/types";

export const MIN_DAYS_SINCE_SHOE = 14;
export const MAX_HORSES_PER_STABLE = 2;

export type BlockReason =
  | "未满十四天"
  | "缺少蹄铁记录"
  | "复查未到期"
  | "已排入他处"
  | "未完成巡诊单";

export interface Evaluation {
  sheet: VisitSheet;
  horse: Horse | undefined;
  eligible: boolean;
  candidate: boolean; // 是否属于本次参评对象（到期常规单 或 加急单）
  reason?: BlockReason;
  daysSinceShoe: number | null;
}

function dayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** 单张未完成巡诊单的可排判定 */
export function evaluateSheet(
  sheet: VisitSheet,
  horse: Horse | undefined,
  targetDate: string,
): Evaluation {
  const base: Evaluation = {
    sheet,
    horse,
    eligible: false,
    candidate: false,
    daysSinceShoe: horse?.lastShoeDate ? dayDiff(horse.lastShoeDate, targetDate) : null,
  };

  if (sheet.status === "完成") return { ...base, reason: "未完成巡诊单" };
  if (sheet.scheduledDate && sheet.scheduledDate !== targetDate) {
    return { ...base, reason: "已排入他处" };
  }
  if (!horse) return { ...base, reason: "缺少蹄铁记录" };

  const candidate = sheet.kind === "加急" || (sheet.kind === "常规" && horse.checkupDue <= targetDate);

  if (horse.lastShoeDate === null || horse.records.length === 0) {
    return { ...base, candidate, reason: "缺少蹄铁记录" };
  }
  const gap = dayDiff(horse.lastShoeDate, targetDate);
  if (gap < MIN_DAYS_SINCE_SHOE) {
    return { ...base, candidate, reason: "未满十四天", daysSinceShoe: gap };
  }
  if (!candidate) return { ...base, reason: "复查未到期", daysSinceShoe: gap };
  return { ...base, eligible: true, candidate: true, daysSinceShoe: gap };
}

interface HorseView {
  evaluation: Evaluation;
  kind: SheetKind;
}

interface PickedItem {
  view: HorseView;
  filledAs: FilledAs;
}

/**
 * 生成某天的巡诊排程：
 * - 各马房先按复查到期先后排常规马，再用加急单补剩余槽位；
 * - 马房顺序按本组“最早参评复查到期日”排列，到期越早越早巡访；
 * - 参评但排不进的马进入 skipped 并写明原因。
 */
export function buildDailyPlan(
  targetDate: string,
  horses: Horse[],
  sheets: VisitSheet[],
  generatedAt: string,
): Plan {
  const horseMap = new Map(horses.map((h) => [h.id, h]));
  const openSheets = sheets.filter(
    (s) => s.status !== "完成" && (!s.scheduledDate || s.scheduledDate === targetDate),
  );

  const groups = new Map<string, HorseView[]>();
  const blocked: PlanSkipped[] = [];

  for (const sheet of openSheets) {
    const horse = horseMap.get(sheet.horseId);
    const ev = evaluateSheet(sheet, horse, targetDate);
    if (ev.eligible && horse) {
      const list = groups.get(horse.stable) ?? [];
      list.push({ evaluation: ev, kind: sheet.kind });
      groups.set(horse.stable, list);
    } else if (ev.candidate) {
      blocked.push({
        sheetId: sheet.id,
        horseId: sheet.horseId,
        stable: horse?.stable ?? "—",
        kind: sheet.kind,
        reason: ev.reason ?? "不可排入",
      });
    }
  }

  const stables = [...groups.keys()].sort((nameA, nameB) => {
    const earliest = (stable: string) =>
      Math.min(
        ...groups.get(stable)!.map((v) => Date.parse(`${v.evaluation.horse!.checkupDue}T00:00:00Z`)),
      );
    return earliest(nameA) - earliest(nameB) || (nameA < nameB ? -1 : 1);
  });

  const entries: PlanEntry[] = [];
  const skipped: PlanSkipped[] = blocked;
  let route = 0;

  for (const stable of stables) {
    const views = groups.get(stable)!;
    const regular = views.filter((v) => v.kind === "常规").sort(compareView);
    const urgent = views.filter((v) => v.kind === "加急").sort(compareView);

    const picked: PickedItem[] = [];
    for (const v of regular) {
      if (picked.length < MAX_HORSES_PER_STABLE) {
        picked.push({ view: v, filledAs: "常规到期" });
      } else {
        skipped.push(skipOf(v, "当天马房两匹马已排满（常规复查名额已满）"));
      }
    }
    for (const v of urgent) {
      const regularCount = picked.filter((p) => p.filledAs === "常规到期").length;
      if (regularCount >= MAX_HORSES_PER_STABLE) {
        skipped.push(skipOf(v, "两槽均为常规复查马，加急单不能占用常规位置"));
      } else if (picked.length >= MAX_HORSES_PER_STABLE) {
        skipped.push(skipOf(v, "当天马房两匹马已排满，加急无剩余位置"));
      } else {
        picked.push({ view: v, filledAs: "加急补位" });
      }
    }

    picked.forEach((item, idx) => {
      route += 1;
      entries.push({
        sheetId: item.view.evaluation.sheet.id,
        horseId: item.view.evaluation.horse!.id,
        stable,
        slot: idx + 1,
        routeOrder: route,
        filledAs: item.filledAs,
      });
    });
  }

  return { date: targetDate, generatedAt, entries, skipped };
}

function skipOf(v: HorseView, reason: string): PlanSkipped {
  return {
    sheetId: v.evaluation.sheet.id,
    horseId: v.evaluation.horse!.id,
    stable: v.evaluation.horse!.stable,
    kind: v.kind,
    reason,
  };
}

function compareView(a: HorseView, b: HorseView): number {
  const dueA = a.evaluation.horse!.checkupDue;
  const dueB = b.evaluation.horse!.checkupDue;
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  if (a.evaluation.sheet.createdAt !== b.evaluation.sheet.createdAt) {
    return a.evaluation.sheet.createdAt < b.evaluation.sheet.createdAt ? -1 : 1;
  }
  return a.evaluation.horse!.id < b.evaluation.horse!.id ? -1 : 1;
}
