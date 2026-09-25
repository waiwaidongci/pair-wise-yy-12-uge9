// 页面操作层：巡诊档案——马匹档案、未完成巡诊单（每马至多一张）、历次装蹄记录

import { useMemo, useState } from "react";
import { archive, useArchive } from "../archive/store";
import {
  SHOE_STATUS_OPTIONS,
  SHOE_TYPE_OPTIONS,
  type SheetKind,
  type ShoeStatus,
} from "../archive/types";
import { addDaysISO, daysBetween, todayISO } from "../scheduling/dates";
import { DueTag, Tag, kindTag, shoeStatusTag, statusTag } from "./ui";

export function ArchiveView() {
  const state = useArchive();
  const [stableFilter, setStableFilter] = useState("全部");
  const [showAddHorse, setShowAddHorse] = useState(false);

  const stables = useMemo(
    () => ["全部", ...new Set(state.horses.map((h) => h.stable))],
    [state.horses],
  );

  const horses = state.horses
    .filter((h) => stableFilter === "全部" || h.stable === stableFilter)
    .sort((a, b) => (a.stable === b.stable ? (a.id < b.id ? -1 : 1) : a.stable < b.stable ? -1 : 1));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>巡诊档案</p>
          <h2>马匹与未完成巡诊单</h2>
        </div>
        <div className="toolbar">
          <select value={stableFilter} onChange={(e) => setStableFilter(e.target.value)}>
            {stables.map((s) => (
              <option key={s} value={s}>{s === "全部" ? "全部马房" : s}</option>
            ))}
          </select>
          <button onClick={() => setShowAddHorse((v) => !v)}>
            {showAddHorse ? "收起建档" : "新增马匹"}
          </button>
        </div>
      </div>

      {showAddHorse && <AddHorseForm onDone={() => setShowAddHorse(false)} />}

      <div className="horse-grid">
        {horses.map((horse) => {
          const open = state.sheets.find((s) => s.horseId === horse.id && s.status !== "完成");
          const gap = horse.lastShoeDate ? daysBetween(horse.lastShoeDate, todayISO()) : null;
          const fresh = gap !== null && gap < 14;
          return (
            <article key={horse.id} className="horse-card">
              <header>
                <div>
                  <h3>{horse.id}</h3>
                  <span className="muted small">{horse.stable}</span>
                </div>
                {shoeStatusTag(horse.shoeStatus)}
              </header>

              <dl className="kv">
                <dt>上次装蹄</dt>
                <dd>
                  {horse.lastShoeDate ?? <Tag tone="red">无蹄铁记录</Tag>}
                  {gap !== null && (
                    <span className={fresh ? "fresh" : "muted small"}>
                      {" "}（{gap} 天{fresh ? "，未满十四天" : ""}）
                    </span>
                  )}
                </dd>
                <dt>复查到期</dt>
                <dd><DueTag due={horse.checkupDue} /></dd>
              </dl>

              {open ? (
                <div className="open-sheet">
                  <div className="tag-row">
                    {kindTag(open.kind)}
                    {statusTag(open.status)}
                  </div>
                  <p className="muted small">{open.reason}</p>
                  {open.status === "待排" && (
                    <button className="ghost" onClick={() => archive.toggleUrgent(open.id)}>
                      {open.kind === "加急" ? "撤为常规单" : "标为加急单"}
                    </button>
                  )}
                </div>
              ) : (
                <OpenSheetForm horseId={horse.id} />
              )}

              <details className="history-records">
                <summary>历次装蹄记录（{horse.records.length}）</summary>
                {horse.records.length === 0 ? (
                  <p className="muted small">暂无蹄铁记录。</p>
                ) : (
                  <ul>
                    {[...horse.records].reverse().map((r, i) => (
                      <li key={i}>
                        <b>{r.date}</b>
                        <span>{r.shoeType}</span>
                        <span className="muted small">{r.note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OpenSheetForm({ horseId }: { horseId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SheetKind>("常规");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!open) {
    return <button className="ghost block-btn" onClick={() => setOpen(true)}>开巡诊单（当前无未完成单）</button>;
  }

  return (
    <div className="inline-form">
      <div className="field-grid one-col">
        <label>
          <span>类型</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as SheetKind)}>
            <option value="常规">常规复查单</option>
            <option value="加急">加急单</option>
          </select>
        </label>
        <label>
          <span>事由</span>
          <input value={reason} placeholder="如：蹄铁松动、步态异常" onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => {
            try {
              archive.openSheet({ horseId, kind, reason });
              setOpen(false);
              setReason("");
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          确认开单
        </button>
        <button onClick={() => setOpen(false)}>取消</button>
      </div>
    </div>
  );
}

function AddHorseForm({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState("");
  const [stable, setStable] = useState("");
  const [hasRecord, setHasRecord] = useState(true);
  const [lastShoeDate, setLastShoeDate] = useState(addDaysISO(todayISO(), -20));
  const [shoeStatus, setShoeStatus] = useState<ShoeStatus>("正常");
  const [shoeType, setShoeType] = useState(SHOE_TYPE_OPTIONS[0]);
  const [checkupDue, setCheckupDue] = useState(addDaysISO(todayISO(), 14));
  const [error, setError] = useState("");

  return (
    <div className="inline-form add-horse">
      <h3>新增马匹档案</h3>
      <div className="field-grid">
        <label>
          <span>马匹编号</span>
          <input value={id} placeholder="HORSE-XX" onChange={(e) => setId(e.target.value)} />
        </label>
        <label>
          <span>马房</span>
          <input value={stable} placeholder="如：四马房" onChange={(e) => setStable(e.target.value)} />
        </label>
        <label>
          <span>是否有蹄铁记录</span>
          <select
            value={hasRecord ? "yes" : "no"}
            onChange={(e) => setHasRecord(e.target.value === "yes")}
          >
            <option value="yes">有（填写上次装蹄）</option>
            <option value="no">无（新入栏，排程时不排入）</option>
          </select>
        </label>
        <label>
          <span>上次装蹄日期</span>
          <input
            type="date"
            disabled={!hasRecord}
            value={lastShoeDate}
            onChange={(e) => setLastShoeDate(e.target.value)}
          />
        </label>
        <label>
          <span>蹄铁状态</span>
          <select
            disabled={!hasRecord}
            value={shoeStatus}
            onChange={(e) => setShoeStatus(e.target.value as ShoeStatus)}
          >
            {SHOE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄铁类型</span>
          <select disabled={!hasRecord} value={shoeType} onChange={(e) => setShoeType(e.target.value)}>
            {SHOE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>复查到期</span>
          <input type="date" value={checkupDue} onChange={(e) => setCheckupDue(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => {
            try {
              archive.addHorse({
                id,
                stable,
                lastShoeDate: hasRecord ? lastShoeDate : null,
                shoeStatus,
                checkupDue,
                shoeType,
              });
              onDone();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          建立档案
        </button>
        <button onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
