// 页面操作层：当天路线（排程结果、原安排对照、换蹄结论填写）

import { useMemo, useState } from "react";
import { archive, useArchive } from "../archive/store";
import {
  RESHOE_ACTIONS,
  SHOE_TYPE_OPTIONS,
  type ConclusionInput,
  type PlanEntry,
} from "../archive/types";
import { addDaysISO, todayISO } from "../scheduling/dates";
import { DueTag, Tag, formatTime, kindTag, shoeStatusTag } from "./ui";

export function RouteView({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const state = useArchive();
  const [completing, setCompleting] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [note, setNote] = useState("");

  const plan = state.plans[date];
  const horseMap = useMemo(() => new Map(state.horses.map((h) => [h.id, h])), [state.horses]);
  const sheetMap = useMemo(() => new Map(state.sheets.map((s) => [s.id, s])), [state.sheets]);

  const original = useMemo(
    () => state.archivedPlans.find((p) => p.date === date),
    [state.archivedPlans, date],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of plan?.entries ?? []) {
      const list = map.get(e.stable) ?? [];
      list.push(e);
      map.set(e.stable, list);
    }
    return [...map.entries()].sort(
      (a, b) => Math.min(...a[1].map((e) => e.routeOrder)) - Math.min(...b[1].map((e) => e.routeOrder)),
    );
  }, [plan]);

  const isToday = date === todayISO();

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>巡诊路线</p>
          <h2>当天路线安排</h2>
        </div>
        <div className="toolbar">
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label="选择排程日期"
          />
          {plan && (
            <button onClick={() => setRegenerating((v) => !v)}>
              {regenerating ? "收起重排" : "重新排程"}
            </button>
          )}
        </div>
      </div>

      <p className="rule-line">
        每马房每天最多 <b>2 匹</b>；上次装蹄未满 <b>14 天</b>或缺少蹄铁记录不排入；
        加急单只能在常规复查马排完后占用<b>剩余位置</b>。
      </p>

      {regenerating && plan && (
        <div className="inline-form reschedule-box">
          <label>
            <span>重排原因（可留空）</span>
            <input
              placeholder="如：晨训发现新伤情，加急单报入"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="toolbar">
            <button
              className="primary"
              onClick={() => {
                archive.generatePlan(date, note || undefined);
                setRegenerating(false);
                setNote("");
              }}
            >
              按规则重新排程
            </button>
            <button onClick={() => setRegenerating(false)}>取消</button>
          </div>
          <p className="hint">当前安排会自动归入“原安排”留档，仍可在下方与历次记录中查看。</p>
        </div>
      )}

      {!plan ? (
        <div className="empty">
          <p>{date} 还没有排程。</p>
          <button className="primary" onClick={() => archive.generatePlan(date)}>
            生成当天巡诊路线
          </button>
        </div>
      ) : (
        <>
          <div className="route-meta">
            <span>生成于 {formatTime(plan.generatedAt)}</span>
            <span>共 {plan.entries.length} 站 · 跳过 {plan.skipped.length} 匹</span>
          </div>

          <div className="stable-groups">
            {grouped.map(([stable, entries]) => (
              <article key={stable} className="stable-card">
                <header>
                  <h3>{stable}</h3>
                  <Tag tone={entries.length >= 2 ? "brown" : "blue"}>
                    {entries.length}/2 槽
                  </Tag>
                </header>
                {entries.map((entry) => {
                  const horse = horseMap.get(entry.horseId);
                  const sheet = sheetMap.get(entry.sheetId);
                  if (!horse || !sheet) return null;
                  return (
                    <div
                      key={entry.sheetId}
                      className={`route-row ${sheet.status === "完成" ? "is-done" : ""}`}
                    >
                      <div className="route-no">
                        <b>{entry.routeOrder}</b>
                        <small>槽 {entry.slot}</small>
                      </div>
                      <div className="route-body">
                        <div className="route-title">
                          <h4>{horse.id}</h4>
                          {entry.filledAs === "加急补位" ? (
                            <Tag tone="amber">加急补位</Tag>
                          ) : (
                            <Tag tone="green">常规到期</Tag>
                          )}
                          {sheet.status === "完成" && <Tag tone="gray">已写结论</Tag>}
                        </div>
                        <p className="muted">{sheet.reason}</p>
                        <div className="tag-row">
                          {kindTag(sheet.kind)}
                          {shoeStatusTag(horse.shoeStatus)}
                          <DueTag due={horse.checkupDue} />
                          <span className="muted small">
                            上次装蹄：{horse.lastShoeDate ?? "无记录"}
                          </span>
                        </div>
                      </div>
                      <div className="toolbar">
                        {sheet.status !== "完成" ? (
                          <button
                            className={completing === sheet.id ? "" : "primary"}
                            onClick={() =>
                              setCompleting((cur) => (cur === sheet.id ? null : sheet.id))
                            }
                          >
                            {completing === sheet.id ? "收起" : "写换蹄结论"}
                          </button>
                        ) : (
                          <Tag tone="green">巡诊完成</Tag>
                        )}
                      </div>
                    </div>
                  );
                })}
              </article>
            ))}
          </div>

          {plan.skipped.length > 0 && (
            <div className="skipped">
              <h3>参评但未排入（{plan.skipped.length}）</h3>
              <ul>
                {plan.skipped.map((s) => (
                  <li key={s.sheetId}>
                    {kindTag(s.kind)}
                    <b>{s.horseId}</b>
                    <span className="muted">{s.stable}</span>
                    <Tag tone={s.kind === "加急" ? "amber" : "red"}>{s.reason}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {completing && (
            <ConclusionForm
              key={completing}
              sheetId={completing}
              onDone={() => setCompleting(null)}
            />
          )}

          {original && (
            <details className="original">
              <summary>查看原安排（重排前留档）· {formatTime(original.archivedAt)} 归档</summary>
              <p className="muted small">{original.note}</p>
              <ol className="original-list">
                {[...original.entries]
                  .sort((a, b) => a.routeOrder - b.routeOrder)
                  .map((e) => (
                    <li key={e.sheetId}>
                      <b>第 {e.routeOrder} 站</b>
                      {e.horseId}
                      <span className="muted">{e.stable} · 槽{e.slot}</span>
                      {e.filledAs === "加急补位" ? (
                        <Tag tone="amber">加急补位</Tag>
                      ) : (
                        <Tag tone="green">常规到期</Tag>
                      )}
                    </li>
                  ))}
              </ol>
            </details>
          )}

          {!isToday && (
            <p className="hint">当前查看的是 {date} 的排程；加急改单只影响所选日期。</p>
          )}
        </>
      )}
    </section>
  );
}

function ConclusionForm({ sheetId, onDone }: { sheetId: string; onDone: () => void }) {
  const state = useArchive();
  const sheet = state.sheets.find((s) => s.id === sheetId);
  const horse = state.horses.find((h) => h.id === sheet?.horseId);

  const [action, setAction] = useState(RESHOE_ACTIONS[0]);
  const [shoeType, setShoeType] = useState(SHOE_TYPE_OPTIONS[0]);
  const [nextDue, setNextDue] = useState(addDaysISO(sheet?.scheduledDate ?? todayISO(), 14));
  const [noteText, setNoteText] = useState("");

  if (!sheet || !horse) return null;

  const submit = () => {
    const input: ConclusionInput = { action, shoeType, nextDue, note: noteText.trim() };
    archive.completeSheet(sheet.id, input);
    onDone();
  };

  return (
    <div className="inline-form conclusion">
      <h3>换蹄结论 · {horse.id}（{horse.stable}）</h3>
      <div className="field-grid">
        <label>
          <span>处理方式</span>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {RESHOE_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄铁类型</span>
          <select value={shoeType} onChange={(e) => setShoeType(e.target.value)}>
            {SHOE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>下次复查日期</span>
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </label>
        <label className="span-2">
          <span>结论备注（步态、蹄形、钉位等）</span>
          <input
            placeholder="如：右前蹄外展改善，新铝蹄铁 8 钉"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
        </label>
      </div>
      <div className="toolbar">
        <button className="primary" onClick={submit}>完成巡诊并归档结论</button>
        <button onClick={onDone}>取消</button>
      </div>
      <p className="hint">换蹄类处理会写入该马历次装蹄记录，并更新上次装蹄日期与蹄铁状态。</p>
    </div>
  );
}
