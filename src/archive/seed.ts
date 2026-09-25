// 巡诊档案初始演示数据：日期相对“今天”生成，保证任何一天打开规则演示都成立

import type { ArchiveState, Horse, Plan, SheetKind, VisitSheet } from "./types";
import { addDaysISO, todayISO } from "../scheduling/dates";
import { buildDailyPlan } from "../scheduling/engine";

interface HorseSeed {
  id: string;
  stable: string;
  shoeOffset: number | null; // 上次装蹄距今天数（负=过去）
  status: Horse["shoeStatus"];
  dueOffset: number; // 复查到期距今天数（负=已逾期）
  kind?: SheetKind;
  reason: string;
  createdAt?: string; // ISO 时间，仅用于加急排序演示
  history?: { offset: number; shoeType: string; note: string }[];
}

// 期望结果（以今天 T 为例）：
// 一马房：HORSE-12 常规到期（逾期2天，槽1）、HORSE-55 加急补位（槽2）
//   HORSE-09 未满14天不排；HORSE-42 缺蹄铁记录不排
// 二马房：HORSE-27、HORSE-18 两匹常规到期已满，HORSE-05 加急无剩余位置
// 三马房：HORSE-23 常规到期（槽1）、HORSE-61 加急补位（槽2）；HORSE-37 未满14天不排
const HORSE_SEEDS: HorseSeed[] = [
  {
    id: "HORSE-09",
    stable: "一马房",
    shoeOffset: -8,
    status: "松动",
    dueOffset: -8,
    reason: "复查时检查右前蹄钉位",
    history: [{ offset: -8, shoeType: "钢蹄铁", note: "右前蹄重钉，蹄壁有缺口" }],
  },
  {
    id: "HORSE-12",
    stable: "一马房",
    shoeOffset: -30,
    status: "磨耗",
    dueOffset: -2,
    reason: "右前蹄外侧磨耗，到期复查",
    history: [{ offset: -30, shoeType: "铝蹄铁", note: "常规更换全套铝蹄铁" }],
  },
  {
    id: "HORSE-42",
    stable: "一马房",
    shoeOffset: null,
    status: null,
    dueOffset: 0,
    reason: "新入栏马，暂无蹄铁档案",
  },
  {
    id: "HORSE-55",
    stable: "一马房",
    shoeOffset: -21,
    status: "脱落",
    dueOffset: 6,
    kind: "加急",
    reason: "左后蹄铁脱落，加急补装",
    createdAt: "07:40",
    history: [{ offset: -21, shoeType: "钢蹄铁", note: "越野赛后换装钢蹄铁" }],
  },
  {
    id: "HORSE-18",
    stable: "二马房",
    shoeOffset: -28,
    status: "磨耗",
    dueOffset: -1,
    reason: "前蹄磨耗到期，评估步态",
    history: [
      { offset: -56, shoeType: "铝蹄铁", note: "更换全套铝蹄铁" },
      { offset: -28, shoeType: "铝蹄铁", note: "复查重装，步态轻微外展" },
    ],
  },
  {
    id: "HORSE-27",
    stable: "二马房",
    shoeOffset: -40,
    status: "裂纹",
    dueOffset: -5,
    reason: "后蹄裂纹复查，加护蹄垫",
    history: [{ offset: -40, shoeType: "加护蹄垫", note: "左后蹄裂纹加装护蹄垫" }],
  },
  {
    id: "HORSE-05",
    stable: "二马房",
    shoeOffset: -16,
    status: "松动",
    dueOffset: 10,
    kind: "加急",
    reason: "左前蹄蹄钉松动，要求加急",
    createdAt: "08:10",
    history: [
      { offset: -44, shoeType: "钢蹄铁", note: "更换全套钢蹄铁" },
      { offset: -16, shoeType: "钢蹄铁", note: "左前蹄钉位调整" },
    ],
  },
  {
    id: "HORSE-23",
    stable: "三马房",
    shoeOffset: -24,
    status: "正常",
    dueOffset: 0,
    reason: "今日到期常规复查",
    history: [{ offset: -24, shoeType: "橡胶蹄铁", note: "调教马换装橡胶蹄铁" }],
  },
  {
    id: "HORSE-37",
    stable: "三马房",
    shoeOffset: -5,
    status: "正常",
    dueOffset: -3,
    reason: "刚装蹄不久，系统提醒复查",
    history: [{ offset: -5, shoeType: "铝蹄铁", note: "新换铝蹄铁，观察步态" }],
  },
  {
    id: "HORSE-61",
    stable: "三马房",
    shoeOffset: -19,
    status: "裂纹",
    dueOffset: 14,
    kind: "加急",
    reason: "右后蹄出现新裂纹，加急处理",
    createdAt: "06:50",
    history: [{ offset: -19, shoeType: "铝蹄铁", note: "更换铝蹄铁，右后蹄注意裂纹" }],
  },
];

function timestampAt(clock: string | undefined): string {
  const t = todayISO();
  return `${t}T${clock ?? "09:00"}:00.000Z`;
}

export function buildSeedState(): ArchiveState {
  const today = todayISO();
  const horses: Horse[] = HORSE_SEEDS.map((seed) => ({
    id: seed.id,
    stable: seed.stable,
    lastShoeDate: seed.shoeOffset === null ? null : addDaysISO(today, seed.shoeOffset),
    shoeStatus: seed.status,
    checkupDue: addDaysISO(today, seed.dueOffset),
    records: (seed.history ?? []).map((h) => ({
      date: addDaysISO(today, h.offset),
      shoeType: h.shoeType,
      note: h.note,
    })),
  }));

  const sheets: VisitSheet[] = HORSE_SEEDS.map((seed, i) => ({
    id: `VS-${String(i + 1).padStart(4, "0")}`,
    horseId: seed.id,
    kind: seed.kind ?? "常规",
    reason: seed.reason,
    createdAt: timestampAt(seed.createdAt),
    status: "待排",
  }));

  // 初始即给出一份当天路线（模拟加急单涌入后的重新排程结果）
  const plan = seededPlan(today, sheets, horses);
  applyPlanToSheets(plan, sheets);

  // 前一晚 19:00 的原安排：加急单尚未报进来，三马房第二槽空着
  const archivedPlan: ArchiveState["archivedPlans"][number] = {
    date: today,
    generatedAt: `${addDaysISO(today, -1)}T19:00:00.000Z`,
    archivedAt: `${today}T08:30:00.000Z`,
    note: "前一晚初排：HORSE-55、HORSE-05、HORSE-61 三张加急单为今天早晨报入，未在原安排内。",
    entries: [
      entryOf("HORSE-27", "二马房", sheets, 1, 1, "常规到期"),
      entryOf("HORSE-18", "二马房", sheets, 2, 2, "常规到期"),
      entryOf("HORSE-12", "一马房", sheets, 3, 1, "常规到期"),
      entryOf("HORSE-23", "三马房", sheets, 4, 1, "常规到期"),
    ],
    skipped: [],
  };

  return { horses, sheets, plans: { [today]: plan }, archivedPlans: [archivedPlan] };
}

function seededPlan(today: string, sheets: VisitSheet[], horses: Horse[]): Plan {
  // 直接调用排程引擎，保证演示数据与判定规则始终一致
  return buildDailyPlan(today, horses, sheets, `${today}T08:30:00.000Z`);
}

function entryOf(
  horseId: string,
  stable: string,
  sheets: VisitSheet[],
  routeOrder: number,
  slot: number,
  filledAs: Plan["entries"][number]["filledAs"],
) {
  const sheet = sheets.find((s) => s.horseId === horseId)!;
  return { sheetId: sheet.id, horseId, stable, slot, routeOrder, filledAs };
}

export function applyPlanToSheets(plan: Plan, sheets: VisitSheet[]): void {
  for (const sheet of sheets) {
    if (sheet.status === "完成") continue;
    const entry = plan.entries.find((e) => e.sheetId === sheet.id);
    if (entry) {
      sheet.status = "已排";
      sheet.scheduledDate = plan.date;
      sheet.routeOrder = entry.routeOrder;
    } else {
      sheet.status = "待排";
      sheet.scheduledDate = undefined;
      sheet.routeOrder = undefined;
    }
  }
}
