// 排程判定的页面追踪：把所有未完成巡诊单映射成“可排/受限/排除 + 原因”

import type { Horse, Plan, VisitSheet } from "../archive/types";
import { evaluateSheet } from "./engine";

export type Verdict =
  | "排入-常规"
  | "排入-加急"
  | "受限-未满十四天"
  | "受限-缺少记录"
  | "排除-槽位已满"
  | "排除-复查未到期"
  | "排除-已排他处";

export interface DecisionRow {
  sheet: VisitSheet;
  horse: Horse | undefined;
  verdict: Verdict;
  detail: string;
  daysSinceShoe: number | null;
}

export function decideRows(
  targetDate: string,
  horses: Horse[],
  sheets: VisitSheet[],
  plan: Plan | undefined,
): DecisionRow[] {
  const horseMap = new Map(horses.map((h) => [h.id, h]));
  const entryBySheet = new Map(plan?.entries.map((e) => [e.sheetId, e]));
  const skippedBySheet = new Map(plan?.skipped.map((s) => [s.sheetId, s]));

  return sheets
    .filter((s) => s.status !== "完成")
    .sort((a, b) => (a.horseId < b.horseId ? -1 : 1))
    .map((sheet) => {
      const horse = horseMap.get(sheet.horseId);
      const ev = evaluateSheet(sheet, horse, targetDate);
      const entry = entryBySheet.get(sheet.id);
      const skipped = skippedBySheet.get(sheet.id);

      let verdict: Verdict;
      let detail: string;

      if (entry) {
        verdict = entry.filledAs === "常规到期" ? "排入-常规" : "排入-加急";
        detail = `${entry.stable}第 ${entry.slot} 槽 · 路线第 ${entry.routeOrder} 站`;
      } else if (skipped) {
        if (skipped.reason === "未满十四天") verdict = "受限-未满十四天";
        else if (skipped.reason === "缺少蹄铁记录") verdict = "受限-缺少记录";
        else verdict = "排除-槽位已满";
        detail = skipped.reason;
        if (verdict === "受限-未满十四天" && ev.daysSinceShoe !== null) {
          detail = `距上次装蹄 ${ev.daysSinceShoe} 天（需满 14 天）`;
        }
      } else if (ev.reason === "已排入他处") {
        verdict = "排除-已排他处";
        detail = `已排入 ${sheet.scheduledDate}`;
      } else if (ev.reason === "未满十四天") {
        verdict = "受限-未满十四天";
        detail = `距上次装蹄 ${ev.daysSinceShoe} 天（需满 14 天）`;
      } else if (ev.reason === "缺少蹄铁记录") {
        verdict = "受限-缺少记录";
        detail = "缺少蹄铁记录，不排入";
      } else if (!ev.candidate) {
        verdict = "排除-复查未到期";
        detail = horse ? `复查 ${horse.checkupDue} 到期` : "复查日期缺失";
      } else {
        verdict = "排除-复查未到期";
        detail = "不参评";
      }

      return { sheet, horse, verdict, detail, daysSinceShoe: ev.daysSinceShoe };
    });
}
