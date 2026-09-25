// 页面操作层的通用小组件与展示格式

import type { ReactNode } from "react";
import { daysBetween, todayISO } from "../scheduling/dates";

export type TagTone =
  | "brown"
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "gray";

export function Tag({ tone = "gray", children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** 复查到期提示：逾期红、今日琥珀、未来蓝 */
export function DueTag({ due }: { due: string }) {
  const gap = daysBetween(todayISO(), due);
  if (gap < 0) return <Tag tone="red">逾期 {-gap} 天 · {due}</Tag>;
  if (gap === 0) return <Tag tone="amber">今日到期 · {due}</Tag>;
  return <Tag tone="blue">{gap} 天后 · {due}</Tag>;
}

export function kindTag(kind: "常规" | "加急") {
  return kind === "加急" ? <Tag tone="amber">加急</Tag> : <Tag tone="blue">常规</Tag>;
}

export function statusTag(status: "待排" | "已排" | "完成") {
  if (status === "完成") return <Tag tone="green">已完成</Tag>;
  if (status === "已排") return <Tag tone="brown">已排入路线</Tag>;
  return <Tag tone="gray">待排</Tag>;
}

export function shoeStatusTag(status: string | null) {
  switch (status) {
    case "正常":
      return <Tag tone="green">蹄铁正常</Tag>;
    case "磨耗":
      return <Tag tone="amber">磨耗</Tag>;
    case "松动":
      return <Tag tone="amber">松动</Tag>;
    case "裂纹":
      return <Tag tone="red">裂纹</Tag>;
    case "脱落":
      return <Tag tone="red">脱落</Tag>;
    default:
      return <Tag tone="gray">无蹄铁记录</Tag>;
  }
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
