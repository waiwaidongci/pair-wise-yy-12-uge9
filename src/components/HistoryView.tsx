import { useState } from "react";
import { archiveStore, selectHistory, useArchive } from "../lib/archive";
import { MAX_HORSES_PER_STABLE_PER_DAY } from "../lib/scheduling";
import { ACTION_TEXT, Badge, priorityBadge } from "./Badge";

export function HistoryView() {
  const state = useArchive();
  const history = selectHistory(state);
  const horseMap = new Map(state.horses.map((h) => [h.id, h]));
  const [expanded, setExpanded] = useState<string | null>(
    state.plans[state.plans.length - 1]?.date ?? null
  );

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>历次记录</p>
            <h2>换蹄结论归档</h2>
          </div>
          <span className="muted">{history.length} 次巡诊完成</span>
        </div>
        {history.length === 0 && <p className="empty">还没有完成的巡诊。在「当天路线」中写完换蹄结论后归档于此。</p>}
        <div className="history-list">
          {history.map((o) => {
            const horse = horseMap.get(o.horseId);
            const c = o.conclusion!;
            return (
              <article key={o.id} className="history-card">
                <header>
                  <h3>
                    {horse?.id} {horse?.name}
                    {priorityBadge(o.priority)}
                  </h3>
                  <Badge tone="green">{c.finishedDate} 完成</Badge>
                </header>
                <p className="muted">
                  单据 {o.id} · {horse?.stable} · {ACTION_TEXT[c.action]}
                </p>
                <dl className="conclusion-grid">
                  <div>
                    <dt>蹄铁类型</dt>
                    <dd>{c.shoeType || "—"}</dd>
                  </div>
                  <div>
                    <dt>蹄铁状态</dt>
                    <dd>{c.shoeStatus || "—"}</dd>
                  </div>
                  <div>
                    <dt>下次复查</dt>
                    <dd>{c.nextCheckup || "—"}</dd>
                  </div>
                  <div>
                    <dt>照片备注 / 步态</dt>
                    <dd>{c.note || "—"}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>原安排留档</p>
            <h2>每日排程快照</h2>
          </div>
          <span className="muted">{state.plans.length} 个排程日</span>
        </div>
        {state.plans.length === 0 && <p className="empty">尚未生成过当天路线。</p>}
        <div className="plan-snapshots">
          {[...state.plans].reverse().map((plan) => {
            const open = expanded === plan.date;
            const placed = plan.decisions.filter((d) => d.placed).length;
            const rejected = plan.decisions.length - placed;
            return (
              <article key={plan.date} className="snapshot-card">
                <button className="snapshot-head" onClick={() => setExpanded(open ? null : plan.date)}>
                  <h3>
                    {plan.date} 路线
                    {plan.locked ? (
                      <Badge tone="amber">已锁定（有完成记录）</Badge>
                    ) : (
                      <Badge tone="blue">未落锤，可重排</Badge>
                    )}
                  </h3>
                  <span className="muted">
                    排入 {placed} · 未排入 {rejected} ·{" "}
                    {open ? "收起 ▴" : "展开 ▾"}
                  </span>
                </button>
                {open && (
                  <div className="snapshot-body">
                    {plan.routes.map((r) => (
                      <div key={r.stable} className="snapshot-route">
                        <h4>
                          {r.stable}
                          <span className="muted">
                            {" "}
                            {r.entries.length}/{MAX_HORSES_PER_STABLE_PER_DAY}
                          </span>
                        </h4>
                        <ol>
                          {r.entries.map((e) => {
                            const h = horseMap.get(e.horseId);
                            return (
                              <li key={e.orderId}>
                                {String(e.seq).padStart(2, "0")} · {h?.id} {h?.name}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                    <table className="grid-table compact">
                      <thead>
                        <tr>
                          <th>单据</th>
                          <th>类型</th>
                          <th>判定</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.decisions.map((d) => (
                          <tr key={d.orderId}>
                            <td>
                              {d.orderId} · {horseMap.get(d.horseId)?.id}
                            </td>
                            <td>{priorityBadge(d.priority)}</td>
                            <td>
                              {d.placed ? (
                                <Badge tone="green">排入</Badge>
                              ) : (
                                <span>
                                  <Badge tone="red">不排入</Badge> {d.reasonText}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>数据</p>
            <h2>档案维护</h2>
          </div>
        </div>
        <p className="muted">排程、巡诊档案保存在本浏览器（localStorage）。如需恢复演示数据可重置，历史记录将被清空。</p>
        <button
          onClick={() => {
            if (confirm("确定恢复为初始演示档案？当前记录会被清空。")) {
              archiveStore.resetSeed();
              setExpanded(null);
            }
          }}
        >
          恢复演示档案
        </button>
      </section>
    </div>
  );
}
