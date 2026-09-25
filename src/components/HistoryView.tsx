// 页面操作层：历次记录——已完成巡诊（换蹄结论）与历史排程、原安排留档

import { useMemo } from "react";
import { useArchive } from "../archive/store";
import { Tag, formatTime, kindTag } from "./ui";

export function HistoryView() {
  const state = useArchive();

  const completed = useMemo(
    () =>
      state.sheets
        .filter((s) => s.status === "完成")
        .sort((a, b) => (a.conclusion!.completedAt < b.conclusion!.completedAt ? 1 : -1)),
    [state.sheets],
  );

  const planDates = useMemo(
    () => Object.keys(state.plans).sort((a, b) => (a < b ? 1 : -1)),
    [state.plans],
  );

  return (
    <div className="history-stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>历次记录</p>
            <h2>换蹄结论与巡诊归档（{completed.length}）</h2>
          </div>
        </div>
        {completed.length === 0 ? (
          <p className="muted">还没有完成的巡诊单。在“当天路线”上写完换蹄结论后会归档到这里。</p>
        ) : (
          <div className="records">
            {completed.map((sheet) => {
              const horse = state.horses.find((h) => h.id === sheet.horseId);
              const c = sheet.conclusion!;
              return (
                <article key={sheet.id} className="history-record">
                  <b>{horse?.id ?? sheet.horseId}</b>
                  <div>
                    <h3>
                      {horse?.stable ?? "—"} · {c.action}
                      <span className="muted small"> {formatTime(c.completedAt)}</span>
                    </h3>
                    <div className="tag-row">
                      {kindTag(sheet.kind)}
                      <Tag tone="brown">{c.shoeType}</Tag>
                      <Tag tone="blue">下次复查 {c.nextDue}</Tag>
                    </div>
                    <p className="muted small">{c.note || "无备注"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>排程留档</p>
            <h2>历史排程与原安排</h2>
          </div>
        </div>

        {state.archivedPlans.length > 0 && (
          <>
            <h3 className="subsection">原安排（重排前自动留档）</h3>
            <div className="plan-list">
              {state.archivedPlans.map((p, i) => (
                <details key={`${p.date}-${p.archivedAt}`} className="plan-details">
                  <summary>
                    <b>{p.date}</b>
                    <Tag tone="amber">原安排</Tag>
                    <span className="muted small">{p.entries.length} 站 · 归档于 {formatTime(p.archivedAt)}</span>
                    {i === 0 && <Tag tone="red">最近一次被替换</Tag>}
                  </summary>
                  <p className="muted small">{p.note}</p>
                  <ol className="original-list">
                    {[...p.entries].sort((a, b) => a.routeOrder - b.routeOrder).map((e) => (
                      <li key={e.sheetId}>
                        <b>第 {e.routeOrder} 站</b>
                        {e.horseId}
                        <span className="muted">{e.stable} · 槽{e.slot}</span>
                        {e.filledAs === "加急补位"
                          ? <Tag tone="amber">加急补位</Tag>
                          : <Tag tone="green">常规到期</Tag>}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </>
        )}

        <h3 className="subsection">各日排程单</h3>
        <div className="plan-list">
          {planDates.map((date) => {
            const plan = state.plans[date];
            return (
              <details key={date} className="plan-details">
                <summary>
                  <b>{date}</b>
                  <Tag tone="green">当前排程</Tag>
                  <span className="muted small">
                    {plan.entries.length} 站 · 跳过 {plan.skipped.length} 匹
                  </span>
                </summary>
                <ol className="original-list">
                  {[...plan.entries].sort((a, b) => a.routeOrder - b.routeOrder).map((e) => (
                    <li key={e.sheetId}>
                      <b>第 {e.routeOrder} 站</b>
                      {e.horseId}
                      <span className="muted">{e.stable} · 槽{e.slot}</span>
                      {e.filledAs === "加急补位"
                        ? <Tag tone="amber">加急补位</Tag>
                        : <Tag tone="green">常规到期</Tag>}
                    </li>
                  ))}
                </ol>
                {plan.skipped.length > 0 && (
                  <ul className="skip-plain">
                    {plan.skipped.map((s) => (
                      <li key={s.sheetId} className="muted small">
                        {s.horseId}（{s.stable}）未排入：{s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
