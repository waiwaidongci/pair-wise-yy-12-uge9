// 页面操作层：排程判定——逐张未完成巡诊单展示“能不能排、为什么”

import { useMemo } from "react";
import { useArchive } from "../archive/store";
import { decideRows, type Verdict } from "../scheduling/decision";
import { Tag, type TagTone } from "./ui";

const VERDICT_META: Record<Verdict, { tone: TagTone; label: string }> = {
  "排入-常规": { tone: "green", label: "排入 · 常规到期" },
  "排入-加急": { tone: "amber", label: "排入 · 加急补位" },
  "受限-未满十四天": { tone: "red", label: "不排 · 未满十四天" },
  "受限-缺少记录": { tone: "red", label: "不排 · 缺蹄铁记录" },
  "排除-槽位已满": { tone: "amber", label: "未排入 · 槽位已满" },
  "排除-复查未到期": { tone: "gray", label: "不参评 · 复查未到期" },
  "排除-已排他处": { tone: "blue", label: "已排入其它日期" },
};

export function DecisionView({ date }: { date: string }) {
  const state = useArchive();
  const plan = state.plans[date];
  const rows = useMemo(() => decideRows(date, state.horses, state.sheets, plan), [date, state, plan]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, [rows]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>排程判定</p>
          <h2>{date} 判定明细</h2>
        </div>
      </div>

      <div className="tag-row summary-row">
        <Tag tone="green">排入常规 {counts["排入-常规"] ?? 0}</Tag>
        <Tag tone="amber">排入加急 {counts["排入-加急"] ?? 0}</Tag>
        <Tag tone="red">未满十四天 {counts["受限-未满十四天"] ?? 0}</Tag>
        <Tag tone="red">缺记录 {counts["受限-缺少记录"] ?? 0}</Tag>
        <Tag tone="amber">槽位已满 {counts["排除-槽位已满"] ?? 0}</Tag>
        <Tag tone="gray">未到期 {counts["排除-复查未到期"] ?? 0}</Tag>
        <Tag tone="blue">已排他处 {counts["排除-已排他处"] ?? 0}</Tag>
      </div>

      <div className="table-wrap">
        <table className="decision-table">
          <thead>
            <tr>
              <th>马匹</th>
              <th>马房</th>
              <th>类型</th>
              <th>上次装蹄</th>
              <th>蹄铁状态</th>
              <th>复查到期</th>
              <th>判定</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = VERDICT_META[row.verdict];
              return (
                <tr key={row.sheet.id}>
                  <td><b>{row.horse?.id ?? row.sheet.horseId}</b></td>
                  <td>{row.horse?.stable ?? "—"}</td>
                  <td>{row.sheet.kind === "加急" ? "加急单" : "常规单"}</td>
                  <td>
                    {row.horse?.lastShoeDate ?? "无"}
                    {row.daysSinceShoe !== null && (
                      <span className="muted small">（{row.daysSinceShoe} 天）</span>
                    )}
                  </td>
                  <td>{row.horse?.shoeStatus ?? "—"}</td>
                  <td>{row.horse?.checkupDue ?? "—"}</td>
                  <td><Tag tone={meta.tone}>{meta.label}</Tag></td>
                  <td className="muted">{row.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint">
        判定顺序：是否未完成且未排他处 → 是否有蹄铁记录 → 上次装蹄是否满 14 天
        → 常规单是否复查到期（加急单免到期条件）→ 马房是否还有剩余槽位。
      </p>
    </section>
  );
}
