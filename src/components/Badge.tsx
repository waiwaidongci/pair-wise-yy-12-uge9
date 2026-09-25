import type { DueState, Priority } from "../types";

const TONE: Record<string, string> = {
  green: "badge-green",
  red: "badge-red",
  amber: "badge-amber",
  blue: "badge-blue",
  gray: "badge-gray",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof TONE;
  children: React.ReactNode;
}) {
  return <span className={`badge ${TONE[tone]}`}>{children}</span>;
}

export function priorityBadge(priority: Priority) {
  return priority === "urgent" ? (
    <Badge tone="red">加急</Badge>
  ) : (
    <Badge tone="blue">复查</Badge>
  );
}

export function dueTone(state: DueState): keyof typeof TONE {
  if (state === "overdue") return "red";
  if (state === "due") return "amber";
  if (state === "later") return "green";
  return "gray";
}

export const ACTION_TEXT: Record<string, string> = {
  replaced: "更换新蹄铁",
  reshod: "原蹄铁重新钉固",
  kept: "检查保留观察",
};
