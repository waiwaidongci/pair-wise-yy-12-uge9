import { useState } from "react";
import { archiveStore, useArchive } from "../lib/archive";
import { daysSinceShoeing, dueLabel, dueState, todayISO } from "../lib/date";
import { Badge, dueTone, priorityBadge } from "./Badge";
import type { Horse, Priority } from "../types";
import { MIN_DAYS_AFTER_SHOEING } from "../lib/scheduling";

export function HorsesView() {
  const state = useArchive();
  const today = todayISO();
  const [form, setForm] = useState({ horseId: "", priority: "normal" as Priority, reason: "" });
  const [error, setError] = useState<string | null>(null);

  const stableGroups = state.horses.reduce<Map<string, Horse[]>>((map, h) => {
    const list = map.get(h.stable) ?? [];
    list.push(h);
    map.set(h.stable, list);
    return map;
  }, new Map());

  const openOrderOf = (horseId: string) =>
    state.orders.find((o) => o.horseId === horseId && (o.status === "pending" || o.status === "scheduled"));

  const submit = () => {
    if (!form.horseId) {
      setError("请先选择马匹");
      return;
    }
    const result = archiveStore.openOrder({
      horseId: form.horseId,
      priority: form.priority,
      reason: form.reason,
      createdAt: today,
    });
    if (result.ok) {
      setError(null);
      setForm({ horseId: "", priority: "normal", reason: "" });
    } else {
      setError(result.error ?? "开单失败");
    }
  };

  const availableHorses = state.horses.filter((h) => !openOrderOf(h.id));

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>巡诊单</p>
            <h2>新建未完成巡诊单</h2>
          </div>
        </div>
        <p className="rule-note">
          <b>每匹马只保留一张未完成巡诊单</b>：已有待排或已排单的马不再出现在下拉列表，完成或撤销后才能再开。
        </p>
        {error && <div className="notice notice-err">{error}</div>}
        <div className="field-grid">
          <label>
            <span>选择马匹</span>
            <select value={form.horseId} onChange={(e) => setForm((f) => ({ ...f, horseId: e.target.value }))}>
              <option value="">{availableHorses.length ? "请选择…" : "所有马都有未完成单"}</option>
              {availableHorses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.stable} · {h.id} {h.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>加急类型</span>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            >
              <option value="normal">普通复查单</option>
              <option value="urgent">加急单（只占剩余位置）</option>
            </select>
          </label>
          <label className="wide">
            <span>巡诊事由 / 步态问题</span>
            <input
              placeholder="如：右前蹄外侧磨耗、步态不稳复查…"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" onClick={submit}>
            开出巡诊单
          </button>
        </div>
      </section>

      {[...stableGroups.entries()].map(([stable, horses]) => (
        <section className="panel" key={stable}>
          <div className="heading">
            <div>
              <p>巡诊档案</p>
              <h2>{stable}</h2>
            </div>
            <span className="muted">{horses.length} 匹马</span>
          </div>
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>马匹</th>
                  <th>上次装蹄</th>
                  <th>蹄铁类型 / 状态</th>
                  <th>复查到期</th>
                  <th>未完成巡诊单</th>
                </tr>
              </thead>
              <tbody>
                {horses.map((h) => {
                  const order = openOrderOf(h.id);
                  const elapsed = daysSinceShoeing(h.lastShoeDate, today);
                  return (
                    <tr key={h.id}>
                      <td>
                        <b>{h.id}</b>
                        <span className="muted"> {h.name}</span>
                      </td>
                      <td>
                        {h.lastShoeDate ? (
                          <>
                            {h.lastShoeDate}
                            <span className="muted">
                              {" "}
                              （已 {elapsed} 天{elapsed !== null && elapsed < MIN_DAYS_AFTER_SHOEING ? "，未满 14 天" : ""}）
                            </span>
                          </>
                        ) : (
                          <Badge tone="red">缺少蹄铁记录</Badge>
                        )}
                      </td>
                      <td>
                        {h.shoeType}
                        <div className="muted">{h.shoeStatus}</div>
                      </td>
                      <td>
                        <Badge tone={dueTone(dueState(h.checkupDue, today))}>
                          {dueLabel(h.checkupDue, today)}
                        </Badge>
                      </td>
                      <td>
                        {order ? (
                          <span className="open-order">
                            {priorityBadge(order.priority)}
                            <span className="muted">
                              {order.id} ·{" "}
                              {order.status === "scheduled"
                                ? `已排 ${order.scheduledDate}`
                                : "待排入排程"}
                            </span>
                            {order.status === "pending" && (
                              <button
                                className="link-btn"
                                onClick={() => archiveStore.cancelOpenOrder(order.id)}
                              >
                                撤销
                              </button>
                            )}
                          </span>
                        ) : (
                          <Badge tone="gray">无未完成单</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
