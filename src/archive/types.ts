// 巡诊档案领域模型：马匹、巡诊单、排程单、换蹄结论

export type ShoeStatus = "正常" | "磨耗" | "松动" | "裂纹" | "脱落";

/** 巡诊单类型：常规复查单 / 加急单 */
export type SheetKind = "常规" | "加急";

/** 巡诊单状态：待排 / 已排 / 完成 */
export type SheetStatus = "待排" | "已排" | "完成";

export const SHOE_STATUS_OPTIONS: ShoeStatus[] = ["正常", "磨耗", "松动", "裂纹", "脱落"];
export const SHOE_TYPE_OPTIONS = ["铝蹄铁", "钢蹄铁", "橡胶蹄铁", "加护蹄垫"];

/** 完成巡诊后可选的换蹄处理结论 */
export const RESHOE_ACTIONS = ["更换全套蹄铁", "更换单块蹄铁", "重装调整", "仅复查"];

/** 历次装蹄记录 */
export interface ShoeRecord {
  date: string; // yyyy-mm-dd
  shoeType: string;
  note: string;
}

/** 马匹巡诊档案 */
export interface Horse {
  id: string; // 马匹编号
  stable: string; // 马房
  lastShoeDate: string | null; // 上次装蹄日期，null 表示缺少蹄铁记录
  shoeStatus: ShoeStatus | null; // 蹄铁状态
  checkupDue: string; // 复查到期 yyyy-mm-dd
  records: ShoeRecord[]; // 历次装蹄记录
}

/** 换蹄结论（完成巡诊时填写） */
export interface Conclusion {
  completedAt: string;
  action: string;
  shoeType: string;
  nextDue: string;
  note: string;
}

export interface ConclusionInput {
  action: string;
  shoeType: string;
  nextDue: string;
  note: string;
}

/** 巡诊单：每匹马同一时间只允许存在一张未完成（非“完成”）巡诊单 */
export interface VisitSheet {
  id: string;
  horseId: string;
  kind: SheetKind;
  reason: string;
  createdAt: string; // ISO 时间
  status: SheetStatus;
  scheduledDate?: string;
  routeOrder?: number;
  conclusion?: Conclusion;
}

/** 排程单中的一行 */
export type FilledAs = "常规到期" | "加急补位";

export interface PlanEntry {
  sheetId: string;
  horseId: string;
  stable: string;
  /** 同马房当天的槽位（1、2） */
  slot: number;
  /** 当天全线路线顺序 */
  routeOrder: number;
  filledAs: FilledAs;
}

/** 参评但未能排入的马及原因 */
export interface PlanSkipped {
  sheetId: string;
  horseId: string;
  stable: string;
  kind: SheetKind;
  reason: string;
}

/** 某天的巡诊排程 */
export interface Plan {
  date: string;
  generatedAt: string;
  entries: PlanEntry[];
  skipped: PlanSkipped[];
}

/** 重新排程前留存的原安排 */
export interface ArchivedPlan extends Plan {
  archivedAt: string;
  note: string;
}

export interface ArchiveState {
  horses: Horse[];
  sheets: VisitSheet[];
  /** 日期 -> 当天最新排程 */
  plans: Record<string, Plan>;
  /** 历次被替换的原安排，按归档时间倒序 */
  archivedPlans: ArchivedPlan[];
}
