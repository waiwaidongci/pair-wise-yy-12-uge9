// 巡诊档案：状态与数据操作（与排程判定、页面展示解耦）
// 负责马匹档案、未完成巡诊单（每马至多一张）、排程单、换蹄结论和历次记录的存取。

import { useSyncExternalStore } from "react";

import type {
  ArchiveState,
  Conclusion,
  ConclusionInput,
  Horse,
  Plan,
  SheetKind,
  ShoeStatus,
  VisitSheet,
} from "./types";
import { buildSeedState } from "./seed";
import { buildDailyPlan } from "../scheduling/engine";
import { nowTimestamp } from "../scheduling/dates";

const STORAGE_KEY = "farrier-rounds-archive-v1";

function loadSeed(): ArchiveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ArchiveState;
      if (parsed.horses && parsed.sheets) return parsed;
    }
  } catch {
    // 损坏的缓存直接回落到演示数据
  }
  return buildSeedState();
}

export class FarrierArchive {
  private state: ArchiveState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = loadSeed();
  }

  getState = (): ArchiveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: ArchiveState): void {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 存储不可用时仅保留内存态
    }
    this.listeners.forEach((l) => l());
  }

  // ---------- 查询辅助 ----------

  horse(id: string): Horse | undefined {
    return this.state.horses.find((h) => h.id === id);
  }

  openSheetOf(horseId: string): VisitSheet | undefined {
    return this.state.sheets.find(
      (s) => s.horseId === horseId && s.status !== "完成",
    );
  }

  // ---------- 巡诊单操作 ----------

  /** 为马匹开一张未完成巡诊单；同一匹马已有未完成单时拒绝。 */
  openSheet(input: {
    horseId: string;
    kind: SheetKind;
    reason: string;
  }): string {
    if (this.openSheetOf(input.horseId)) {
      throw new Error("该马已有未完成巡诊单，每匹马只保留一张");
    }
    if (!this.horse(input.horseId)) throw new Error("马匹编号不存在");
    const id = `VS-${String(this.state.sheets.length + 1).padStart(4, "0")}`;
    const sheet: VisitSheet = {
      id,
      horseId: input.horseId,
      kind: input.kind,
      reason: input.reason.trim() || (input.kind === "加急" ? "加急巡诊" : "常规复查"),
      createdAt: nowTimestamp(),
      status: "待排",
    };
    this.commit({ ...this.state, sheets: [...this.state.sheets, sheet] });
    return id;
  }

  /** 加急 / 撤加急（仅待排单可改） */
  toggleUrgent(sheetId: string): void {
    const sheets = this.state.sheets.map((s) => {
      if (s.id !== sheetId || s.status !== "待排") return s;
      return { ...s, kind: (s.kind === "加急" ? "常规" : "加急") as SheetKind };
    });
    this.commit({ ...this.state, sheets });
  }

  /** 生成/重排某天路线；已有安排先归入“原安排”留档。 */
  generatePlan(date: string, note?: string): Plan {
    const previous = this.state.plans[date];
    const archivedPlans = [...this.state.archivedPlans];
    if (previous) {
      archivedPlans.unshift({
        ...previous,
        archivedAt: nowTimestamp(),
        note: note ?? "重新排程，原安排自动留档。",
      });
    }
    const plan = buildDailyPlan(date, this.state.horses, this.state.sheets, nowTimestamp());

    // 同步巡诊单的已排/待排状态（排入其它日期的单子不动）
    const sheets = this.state.sheets.map((s) => {
      if (s.status === "完成") return s;
      const entry = plan.entries.find((e) => e.sheetId === s.id);
      if (entry) {
        return { ...s, status: "已排" as const, scheduledDate: date, routeOrder: entry.routeOrder };
      }
      if (s.scheduledDate === date) {
        return { ...s, status: "待排" as const, scheduledDate: undefined, routeOrder: undefined };
      }
      return s;
    });

    this.commit({
      ...this.state,
      sheets,
      plans: { ...this.state.plans, [date]: plan },
      archivedPlans,
    });
    return plan;
  }

  /**
   * 完成巡诊、写换蹄结论：
   * 巡诊单归档为“完成”；换蹄类结论追加一条装蹄记录并更新上次装蹄日期与蹄铁状态，
   * “仅复查”只记录结论。历次记录仍可在档案中查看。
   */
  completeSheet(sheetId: string, input: ConclusionInput): void {
    const sheet = this.state.sheets.find((s) => s.id === sheetId);
    if (!sheet || sheet.status === "完成") return;
    const horse = this.horse(sheet.horseId);
    if (!horse) return;

    const conclusion: Conclusion = { completedAt: nowTimestamp(), ...input };
    const isReshoe = input.action !== "仅复查";

    const horses = this.state.horses.map((h) => {
      if (h.id !== horse.id) return h;
      const nextStatus: ShoeStatus | null = isReshoe ? "正常" : h.shoeStatus;
      const records = isReshoe
        ? [
            ...h.records,
            {
              date: sheet.scheduledDate ?? conclusion.completedAt.slice(0, 10),
              shoeType: input.shoeType,
              note: `${input.action}：${input.note || "见巡诊单"}`,
            },
          ]
        : h.records;
      return {
        ...h,
        shoeStatus: nextStatus,
        lastShoeDate: isReshoe
          ? sheet.scheduledDate ?? conclusion.completedAt.slice(0, 10)
          : h.lastShoeDate,
        checkupDue: input.nextDue,
        records,
      };
    });

    const sheets = this.state.sheets.map((s) =>
      s.id === sheetId
        ? { ...s, status: "完成" as const, conclusion }
        : s,
    );

    this.commit({ ...this.state, horses, sheets });
  }

  // ---------- 马匹档案 ----------

  addHorse(input: {
    id: string;
    stable: string;
    lastShoeDate: string | null;
    shoeStatus: ShoeStatus | null;
    checkupDue: string;
    shoeType?: string;
  }): void {
    const id = input.id.trim().toUpperCase();
    if (!id) throw new Error("请填写马匹编号");
    if (this.horse(id)) throw new Error("该马匹编号已存在");
    if (!input.stable.trim()) throw new Error("请填写马房");
    const hasRecord = input.lastShoeDate !== null;
    const horse: Horse = {
      id,
      stable: input.stable.trim(),
      lastShoeDate: input.lastShoeDate,
      shoeStatus: hasRecord ? input.shoeStatus : null,
      checkupDue: input.checkupDue,
      records: hasRecord
        ? [
            {
              date: input.lastShoeDate!,
              shoeType: input.shoeType ?? "铝蹄铁",
              note: "建档时装蹄记录",
            },
          ]
        : [],
    };
    this.commit({ ...this.state, horses: [...this.state.horses, horse] });
  }

  resetDemo(): void {
    this.commit(buildSeedState());
  }
}

export const archive = new FarrierArchive();

/** React 绑定：页面操作层通过该 hook 读取巡诊档案 */
export function useArchive(): ArchiveState {
  return useSyncExternalStore(archive.subscribe, archive.getState, archive.getState);
}
