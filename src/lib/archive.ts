import { useSyncExternalStore } from "react";
import type {
  ArchiveState,
  Horse,
  PlanSnapshot,
  ScheduleDecision,
  VisitConclusion,
  VisitOrder,
} from "../types";
import { buildSeedState } from "../data/seed";
import { hasOpenOrder, isOpenStatus, scheduleVisits } from "./scheduling";

const STORAGE_KEY = "farrier-archive-v1";

function loadState(): ArchiveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ArchiveState;
  } catch {
    /* 存储不可用时退回内置档案 */
  }
  return buildSeedState();
}

/**
 * 巡诊档案仓库（数据层）。
 * 只负责状态的保存与业务写入：马匹、巡诊单（每马至多一张未完成单）、
 * 排程快照（原安排留档）、换蹄结论（历次记录）。
 * 排程怎么排由 lib/scheduling 的纯函数决定，这里只负责调用和落库。
 */
class ArchiveStore {
  private state: ArchiveState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = loadState();
  }

  getState = (): ArchiveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: ArchiveState) {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 持久化失败不影响当次操作 */
    }
    this.listeners.forEach((fn) => fn());
  }

  resetSeed() {
    this.commit(buildSeedState());
  }

  /** 新开一张巡诊单；同一匹马已有未完成单时拒绝 */
  openOrder(input: {
    horseId: string;
    priority: VisitOrder["priority"];
    reason: string;
    createdAt: string;
  }): { ok: boolean; error?: string } {
    if (hasOpenOrder(this.state.orders, input.horseId)) {
      return { ok: false, error: "该马已有一张未完成巡诊单，不能重复开单" };
    }
    const seq = this.state.seq + 1;
    const order: VisitOrder = {
      id: `VO-${seq}`,
      horseId: input.horseId,
      priority: input.priority,
      createdAt: input.createdAt,
      reason: input.reason.trim() || (input.priority === "urgent" ? "加急巡诊" : "复查巡诊"),
      status: "pending",
      scheduledDate: null,
      conclusion: null,
    };
    this.commit({ ...this.state, orders: [...this.state.orders, order], seq });
    return { ok: true };
  }

  /**
   * 把当日排程结果落档：
   * - 首次排程：写入排程快照，排入的单转 scheduled；
   * - 重排（该日未开始完成）：释放旧安排后按新判定重建；
   * - 已开始完成的日期锁定，拒绝重排以保留原安排。
   */
  applyPlan(date: string, createdAt: string): { ok: boolean; error?: string } {
    const existing = this.state.plans.find((p) => p.date === date);
    if (existing?.locked) {
      return { ok: false, error: "当天已有巡诊完成，原安排已锁定留档，不能重排" };
    }

    // 重排时先释放该日仍未完成的旧单，再让所有未完成单重新参与判定
    let orders = this.state.orders;
    if (existing) {
      orders = orders.map((o) =>
        o.scheduledDate === date && o.status === "scheduled"
          ? { ...o, status: "pending", scheduledDate: null }
          : o
      );
    }

    const candidates = orders.filter((o) => o.status === "pending");
    const result = scheduleVisits({ date, horses: this.state.horses, orders: candidates });
    const placedIds = new Set(result.decisions.filter((d) => d.placed).map((d) => d.orderId));

    orders = orders.map((o) =>
      placedIds.has(o.id) ? { ...o, status: "scheduled" as const, scheduledDate: date } : o
    );

    const snapshot: PlanSnapshot = {
      date,
      createdAt,
      decisions: result.decisions,
      routes: result.routes,
      locked: false,
    };
    const plans = existing
      ? this.state.plans.map((p) => (p.date === date ? snapshot : p))
      : [...this.state.plans, snapshot];

    this.commit({ ...this.state, orders, plans });
    return { ok: true };
  }

  /**
   * 完成巡诊并写入换蹄结论：
   * 单据转 done、排程快照锁定、马匹档案的装蹄日期/蹄铁状态/复查到期同步更新。
   */
  completeOrder(orderId: string, conclusion: VisitConclusion): void {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order || !isOpenStatus(order.status)) return;

    const orders = this.state.orders.map((o) =>
      o.id === orderId
        ? { ...o, status: "done" as const, conclusion: { ...conclusion } }
        : o
    );

    const horses = this.state.horses.map((h): Horse => {
      if (h.id !== order.horseId) return h;
      const replaced = conclusion.action !== "kept";
      return {
        ...h,
        // 换蹄/重钉后装蹄周期重新起算；仅检查保留则不动上次装蹄日期
        lastShoeDate: replaced ? conclusion.finishedDate : h.lastShoeDate,
        shoeType: conclusion.shoeType || h.shoeType,
        shoeStatus: conclusion.shoeStatus || h.shoeStatus,
        checkupDue: conclusion.nextCheckup || h.checkupDue,
      };
    });

    const plans = order.scheduledDate
      ? this.state.plans.map((p) =>
          p.date === order.scheduledDate ? { ...p, locked: true } : p
        )
      : this.state.plans;

    this.commit({ ...this.state, orders, horses, plans });
  }

  /** 撤销一张未完成单（开错时使用，不影响已完成记录） */
  cancelOpenOrder(orderId: string): void {
    const orders = this.state.orders.filter(
      (o) => !(o.id === orderId && isOpenStatus(o.status))
    );
    this.commit({ ...this.state, orders });
  }

  /** 取某匹马的未完成单（有且至多一张） */
  getOpenOrderFor(horseId: string): VisitOrder | undefined {
    return this.state.orders.find(
      (o) => o.horseId === horseId && isOpenStatus(o.status)
    );
  }
}

export const archiveStore = new ArchiveStore();

/** 页面层通过该 hook 订阅档案，组件自身不直接改状态 */
export function useArchive(): ArchiveState {
  return useSyncExternalStore(archiveStore.subscribe, archiveStore.getState);
}

/** 供 UI 直接复用的只读判定：对某日重新模拟排程（不落档） */
export function previewSchedule(state: ArchiveState, date: string) {
  const occupied = state.plans
    .filter((p) => p.date === date)
    .flatMap((p) => p.routes.flatMap((r) => r.entries));
  const candidates = state.orders.filter((o) => o.status === "pending");
  return scheduleVisits({
    date,
    horses: state.horses,
    orders: candidates,
    occupied,
  });
}

/** 历次完成的巡诊单（换蹄结论记录），按完成日期倒序 */
export function selectHistory(state: ArchiveState): VisitOrder[] {
  return state.orders
    .filter((o) => o.status === "done" && o.conclusion)
    .sort((a, b) => (a.conclusion!.finishedDate < b.conclusion!.finishedDate ? 1 : -1));
}

/** 某日排程判定明细（优先取已归档快照） */
export function selectPlanDecisions(state: ArchiveState, date: string): ScheduleDecision[] {
  const plan = state.plans.find((p) => p.date === date);
  return plan ? plan.decisions : [];
}
