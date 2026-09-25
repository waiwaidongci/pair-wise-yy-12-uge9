import type { ArchiveState, Horse, VisitOrder } from "../types";

/**
 * 初始档案：基准日为 2026-09-25。
 * 数据刻意覆盖四种排程情形：正常排入、缺记录、未满 14 天、加急只占剩余位。
 */
export function buildSeedState(): ArchiveState {
  const today = "2026-09-25";
  const horses: Horse[] = [
    // 一号马房：两匹复查到期可排，加急第三匹只能等
    {
      id: "HORSE-18",
      name: "疾风",
      stable: "一号马房",
      lastShoeDate: "2026-09-05",
      shoeType: "铝蹄铁",
      shoeStatus: "右前蹄外侧磨耗",
      checkupDue: "2026-09-19",
    },
    {
      id: "HORSE-27",
      name: "云溪",
      stable: "一号马房",
      lastShoeDate: "2026-09-08",
      shoeType: "加护蹄垫",
      shoeStatus: "后蹄裂纹，垫面尚稳固",
      checkupDue: "2026-09-23",
    },
    {
      id: "HORSE-33",
      name: "惊帆",
      stable: "一号马房",
      lastShoeDate: "2026-09-10",
      shoeType: "钢蹄铁",
      shoeStatus: "蹄钉疑似松动，教练要求尽快",
      checkupDue: "2026-09-26",
    },
    // 二号马房：缺记录 / 未满 14 天 / 可排
    {
      id: "HORSE-31",
      name: "踏雪",
      stable: "二号马房",
      lastShoeDate: "2026-09-01",
      shoeType: "铝蹄铁",
      shoeStatus: "步态轻微不稳，左前蹄受力偏重",
      checkupDue: "2026-09-20",
    },
    {
      id: "HORSE-42",
      name: "乌骓",
      stable: "二号马房",
      lastShoeDate: "2026-09-20",
      shoeType: "钢蹄铁",
      shoeStatus: "刚完成装蹄，钉位正常",
      checkupDue: "2026-10-04",
    },
    {
      id: "HORSE-55",
      name: "无名",
      stable: "二号马房",
      lastShoeDate: null,
      shoeType: "—",
      shoeStatus: "新入俱乐部，既往蹄铁资料缺失",
      checkupDue: null,
    },
    // 三号马房：一匹逾期 + 一匹加急共同占满
    {
      id: "HORSE-61",
      name: "绝影",
      stable: "三号马房",
      lastShoeDate: "2026-08-30",
      shoeType: "铝蹄铁",
      shoeStatus: "两前蹄蹄铁磨薄",
      checkupDue: "2026-09-13",
    },
    {
      id: "HORSE-70",
      name: "赤兔",
      stable: "三号马房",
      lastShoeDate: "2026-09-07",
      shoeType: "越野防滑蹄铁",
      shoeStatus: "赛前临时加急，需检查防滑钉",
      checkupDue: "2026-09-28",
    },
  ];

  const open = (
    id: string,
    horseId: string,
    priority: VisitOrder["priority"],
    reason: string,
    daysAgo: number
  ): VisitOrder => ({
    id,
    horseId,
    priority,
    createdAt: shift(today, -daysAgo),
    reason,
    status: "pending",
    scheduledDate: null,
    conclusion: null,
  });

  const orders: VisitOrder[] = [
    open("VO-1001", "HORSE-18", "normal", "14 天复查到期，评估磨耗后更换", 3),
    open("VO-1002", "HORSE-27", "normal", "裂纹复查，确认加护垫是否继续使用", 2),
    open("VO-1003", "HORSE-33", "urgent", "加急：蹄钉松动，骑乘前必须处理", 1),
    open("VO-1004", "HORSE-31", "normal", "步态不稳复查，配合教练评估", 2),
    open("VO-1005", "HORSE-42", "normal", "装蹄后例行复查（预计尚早）", 1),
    open("VO-1006", "HORSE-55", "normal", "建档前首次检查，需补蹄铁资料", 1),
    open("VO-1007", "HORSE-61", "normal", "复查已逾期，蹄铁磨薄待换", 5),
    open("VO-1008", "HORSE-70", "urgent", "加急：越野赛前检查防滑钉", 1),
  ];

  return { horses, orders, plans: [], seq: 1008 };
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
