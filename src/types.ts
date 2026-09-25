/** 加急级别：普通复查单 / 加急单 */
export type Priority = "normal" | "urgent";

/** 巡诊单状态：待排入排程 / 已排入某天路线 / 已完成换蹄结论 */
export type OrderStatus = "pending" | "scheduled" | "done";

/** 复查紧迫度，用于排程排序与页面提醒 */
export type DueState = "overdue" | "due" | "later" | "none";

/** 马匹档案 */
export interface Horse {
  id: string;
  name: string;
  /** 马房编号 */
  stable: string;
  /** 上次装蹄日期（ISO yyyy-mm-dd），缺失表示没有蹄铁记录 */
  lastShoeDate: string | null;
  /** 蹄铁类型，如 铝蹄铁 / 钢蹄铁 / 加护蹄垫 */
  shoeType: string;
  /** 蹄铁状态描述，如 磨耗 / 裂纹 / 松动 */
  shoeStatus: string;
  /** 复查到期日（ISO yyyy-mm-dd） */
  checkupDue: string | null;
}

/** 巡诊单（同一匹马同一时刻只允许一张未完成单） */
export interface VisitOrder {
  id: string;
  horseId: string;
  priority: Priority;
  createdAt: string;
  reason: string;
  status: OrderStatus;
  /** 已排入的日期（ISO yyyy-mm-dd） */
  scheduledDate: string | null;
  /** 完成后写入的换蹄结论 */
  conclusion: VisitConclusion | null;
}

/** 换蹄结论（完成巡诊时填写） */
export interface VisitConclusion {
  finishedDate: string;
  action: "replaced" | "reshod" | "kept";
  shoeType: string;
  shoeStatus: string;
  nextCheckup: string;
  note: string;
}

export type RejectReasonCode = "NO_RECORD" | "TOO_SOON" | "STABLE_FULL";

/** 一张巡诊单在某次排程中的判定结果 */
export interface ScheduleDecision {
  orderId: string;
  horseId: string;
  stable: string;
  priority: Priority;
  placed: boolean;
  /** 未排入原因编码，排入时为 null */
  reasonCode: RejectReasonCode | null;
  reasonText: string;
}

/** 已排入路线中的一个站点（一匹马） */
export interface RouteEntry {
  orderId: string;
  horseId: string;
  /** 全局顺序号，跨马房连续编号 */
  seq: number;
  /** 马房内顺序 */
  stableSeq: number;
}

/** 一次排程结果（纯函数产物，不做任何持久化） */
export interface ScheduleResult {
  date: string;
  decisions: ScheduleDecision[];
  /** 按马房分组的当天路线 */
  routes: Array<{ stable: string; entries: RouteEntry[] }>;
  /** 各马房当天已用/容量 */
  capacity: Array<{ stable: string; used: number; capacity: number }>;
}

/** 某日排程的归档快照，原安排即使后续重排也可查 */
export interface PlanSnapshot {
  date: string;
  createdAt: string;
  decisions: ScheduleDecision[];
  routes: Array<{ stable: string; entries: RouteEntry[] }>;
  /** 该日是否已开始完成巡诊，开始后锁定、不可重排 */
  locked: boolean;
}

/** 档案仓库的完整持久化状态 */
export interface ArchiveState {
  horses: Horse[];
  orders: VisitOrder[];
  plans: PlanSnapshot[];
  seq: number;
}
