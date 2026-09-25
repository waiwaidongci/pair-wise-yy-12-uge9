import { useMemo, useState } from "react";
import type { Horse, PlanSnapshot, VisitOrder, VisitConclusion } from "../types";
import { archiveStore, previewSchedule, selectPlanDecisions, useArchive } from "../lib/archive";
import { MAX_HORSES_PER_STABLE_PER_DAY, REJECT_TEXT } from "../lib/scheduling";
import { addDays, dueLabel, dueState, todayISO } from "../lib/date";
import { ACTION_TEXT, Badge, dueTone, priorityBadge } from "./Badge";

export function ScheduleView() {
  const state = useArchive();
  const [date, setDate] = useState(todayISO());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);

  const horseMap = useMemo(
    () => new Map(state.horses.map((h) => [h.id, h])),
    [state.horses]
  );
  const orderMap = useMemo(
    () => new Map(state.orders.map((o) => [o.id, o])),
    [state.orders]
  );

  const plan: PlanSnapshot | undefined = state.plans.find((p) => p.date === date);
  const preview = useMemo(
    () => previewSchedule(state, date),
    [state, date]
  );

  // 已归档则展示「原安排」，否则展示实时判定预览
  const routes = plan ? plan.routes : preview.routes;
  const decisions = plan ? selectPlanDecisions(state, date) : preview.decisions;
  const decidedIds = new Set(decisions.map((d) => d.orderId));

  const applyPlan = () => {
    const result = archiveStore.applyPlan(date, todayISO());
    if (result.ok) {
      setMessage({
        ok: true,
        text: plan ? "已按最新规则重排，旧安排由本次结果替换。" : "当天路线已落档，可逐匹写换蹄结论。",
      });
    } else {
      setMessage({ ok: false, text: result.error ?? "排程失败" });
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>巡诊排程</p>
            <h2>当天路线</h2>
          </div>
          <div className="toolbar">
            <label className="inline-date">
              <span>巡诊日期</span>
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setMessage(null); }} />
            </label>
            <button
              className="primary"
              onClick={applyPlan}
              disabled={plan?.locked}
              title={plan?.locked ? "当天已有巡诊完成，原安排已锁定" : undefined}
            >
              {plan
                ? plan.locked
                  ? "原安排已锁定"
                  : "重新排程"
                : "生成当天路线"}
            </button>
          </div>
        </div>

        <p className="rule-note">
          规则：同马房一天最多 {MAX_HORSES_PER_STABLE_PER_DAY} 匹；上次装蹄未满 14 天或缺少蹄铁记录不排入；
          普通复查单先占名额，<b>加急单只能占用剩余位置</b>。
          {plan ? (
            plan.locked ? (
              <Badge tone="amber">已有巡诊完成，原安排锁定留档</Badge>
            ) : (
              <Badge tone="blue">已归档安排（{plan.createdAt} 生成），重排会替换未完成部分</Badge>
            )
          ) : (
            <Badge tone="gray">当前为实时预览，落档后成为可查的原安排</Badge>
          )}
        </p>

        {message && (
          <div className={`notice ${message.ok ? "notice-ok" : "notice-err"}`}>{message.text}</div>
        )}

        <div className="routes">
          {routes.length === 0 && (
            <p className="empty">没有可排入的马房——候选单均未通过资格判定。</p>
          )}
          {routes.map((route) => (
            <article key={route.stable} className="route-card">
              <header>
                <h3>{route.stable}</h3>
                <span className="muted">
                  {route.entries.length}/{MAX_HORSES_PER_STABLE_PER_DAY} 匹
                </span>
              </header>
              {route.entries.map((entry) => {
                const horse = horseMap.get(entry.horseId);
                const order = orderMap.get(entry.orderId);
                if (!horse || !order) return null;
                return (
                  <RouteRow
                    key={entry.orderId}
                    seq={entry.seq}
                    horse={horse}
                    order={order}
                    date={date}
                    formOpen={openForm === order.id}
                    onToggleForm={() => setOpenForm(openForm === order.id ? null : order.id)}
                  />
                );
              })}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>排程判定</p>
            <h2>{plan ? "原安排判定明细" : "判定明细（预览）"}</h2>
          </div>
          <span className="muted">
            排入 {decisions.filter((d) => d.placed).length} 单 · 未排入{" "}
            {decisions.filter((d) => !d.placed).length} 单
          </span>
        </div>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>马匹</th>
                <th>马房</th>
                <th>类型</th>
                <th>上次装蹄</th>
                <th>复查到期</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => {
                const horse = horseMap.get(d.horseId);
                if (!horse) return null;
                return (
                  <tr key={d.orderId}>
                    <td>
                      <b>{horse.id}</b>
                      <span className="muted"> {horse.name}</span>
                    </td>
                    <td>{d.stable}</td>
                    <td>{priorityBadge(d.priority)}</td>
                    <td>{horse.lastShoeDate ?? "—"}</td>
                    <td>
                      <Badge tone={dueTone(dueState(horse.checkupDue, date))}>
                        {dueLabel(horse.checkupDue, date)}
                      </Badge>
                    </td>
                    <td>
                      {d.placed ? (
                        <Badge tone="green">排入当天路线</Badge>
                      ) : (
                        <span className="reject">
                          <Badge tone="red">不排入</Badge> {d.reasonText}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {decisions.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">没有待排巡诊单。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {plan && (
          <NewPendingSincePlan
            date={date}
            decidedIds={decidedIds}
            orders={state.orders}
            horseMap={horseMap}
          />
        )}
      </section>
    </div>
  );
}

/** 落档之后又新开、尚未参与该日安排的待排单，提示重排 */
function NewPendingSincePlan({
  date,
  decidedIds,
  orders,
  horseMap,
}: {
  date: string;
  decidedIds: Set<string>;
  orders: VisitOrder[];
  horseMap: Map<string, Horse>;
}) {
  const fresh = orders.filter((o) => o.status === "pending" && !decidedIds.has(o.id));
  if (fresh.length === 0) return null;
  return (
    <div className="late-orders">
      <p>
        <Badge tone="amber">落档后新增 {fresh.length} 张待排单</Badge>
      </p>
      <ul>
        {fresh.map((o) => {
          const h = horseMap.get(o.horseId);
          return (
            <li key={o.id}>
              {o.id} · {h?.id} {h?.name}（{h?.stable}）
              {h && !h.lastShoeDate && ` · ${REJECT_TEXT.NO_RECORD}`}
            </li>
          );
        })}
      </ul>
      <p className="muted">需要纳入 {date} 时请点「重新排程」；未满 14 天或无蹄铁记录仍不会被排入。</p>
    </div>
  );
}

function RouteRow({
  seq,
  horse,
  order,
  date,
  formOpen,
  onToggleForm,
}: {
  seq: number;
  horse: Horse;
  order: VisitOrder;
  date: string;
  formOpen: boolean;
  onToggleForm: () => void;
}) {
  const done = order.status === "done";
  return (
    <div className="route-row">
      <div className="route-head">
        <b className="seq">{String(seq).padStart(2, "0")}</b>
        <div className="route-main">
          <h4>
            {horse.id} {horse.name} {priorityBadge(order.priority)}
            {done && <Badge tone="green">已完成</Badge>}
          </h4>
          <p className="muted">{order.reason}</p>
          <p className="horse-line">
            蹄铁：{horse.shoeType} · {horse.shoeStatus} ｜ 上次装蹄 {horse.lastShoeDate ?? "无记录"} ｜{" "}
            <Badge tone={dueTone(dueState(horse.checkupDue, date))}>
              复查：{dueLabel(horse.checkupDue, date)}
            </Badge>
          </p>
        </div>
        <div className="route-actions">
          {!done && (
            <button onClick={onToggleForm}>{formOpen ? "收起" : "写换蹄结论"}</button>
          )}
          {done && order.conclusion && (
            <span className="muted">
              {ACTION_TEXT[order.conclusion.action]} · 下次复查 {order.conclusion.nextCheckup}
            </span>
          )}
        </div>
      </div>
      {formOpen && !done && <ConclusionForm order={order} defaultDate={date} />}
    </div>
  );
}

function ConclusionForm({ order, defaultDate }: { order: VisitOrder; defaultDate: string }) {
  const [form, setForm] = useState<VisitConclusion>({
    finishedDate: defaultDate,
    action: "replaced",
    shoeType: "铝蹄铁",
    shoeStatus: "新换蹄铁，钉位正常，磨合观察",
    nextCheckup: addDays(defaultDate, 14),
    note: "",
  });

  const submit = () => {
    archiveStore.completeOrder(order.id, form);
  };

  const update = <K extends keyof VisitConclusion>(key: K, value: VisitConclusion[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="conclusion-form">
      <h4>换蹄结论 · 单据 {order.id}</h4>
      <div className="field-grid">
        <label>
          <span>完成日期</span>
          <input
            type="date"
            value={form.finishedDate}
            onChange={(e) => update("finishedDate", e.target.value)}
          />
        </label>
        <label>
          <span>处理方式</span>
          <select value={form.action} onChange={(e) => update("action", e.target.value as VisitConclusion["action"])}>
            <option value="replaced">更换新蹄铁（装蹄周期重新起算）</option>
            <option value="reshod">原蹄铁重新钉固（装蹄周期重新起算）</option>
            <option value="kept">检查保留观察（上次装蹄日期不变）</option>
          </select>
        </label>
        <label>
          <span>蹄铁类型</span>
          <input value={form.shoeType} onChange={(e) => update("shoeType", e.target.value)} />
        </label>
        <label>
          <span>下次复查到期</span>
          <input
            type="date"
            value={form.nextCheckup}
            onChange={(e) => update("nextCheckup", e.target.value)}
          />
        </label>
        <label className="wide">
          <span>蹄铁状态</span>
          <input value={form.shoeStatus} onChange={(e) => update("shoeStatus", e.target.value)} />
        </label>
        <label className="wide">
          <span>照片备注 / 步态说明</span>
          <input
            placeholder="步态问题、左右前后蹄对比、照片编号等"
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary" onClick={submit}>
          完成巡诊并归档
        </button>
      </div>
    </div>
  );
}
