import { useMemo, useState } from "react";
import "./styles.css";
import { archive, useArchive } from "./archive/store";
import { todayISO } from "./scheduling/dates";
import { RouteView } from "./components/RouteView";
import { DecisionView } from "./components/DecisionView";
import { ArchiveView } from "./components/ArchiveView";
import { HistoryView } from "./components/HistoryView";

type Tab = "route" | "decision" | "archive" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "route", label: "当天路线" },
  { key: "decision", label: "排程判定" },
  { key: "archive", label: "巡诊档案" },
  { key: "history", label: "历次记录" },
];

function App() {
  const state = useArchive();
  const [tab, setTab] = useState<Tab>("route");
  const [date, setDate] = useState(todayISO());

  const metrics = useMemo(() => {
    const open = state.sheets.filter((s) => s.status !== "完成");
    const urgent = open.filter((s) => s.kind === "加急").length;
    const plan = state.plans[date];
    const due = state.horses.filter((h) => h.checkupDue <= date).length;
    return [
      { label: "待复查到期", value: due },
      { label: "未完成巡诊单", value: open.length },
      { label: "加急单", value: urgent },
      { label: "今日排程", value: plan ? `${plan.entries.length} 站` : "未排" },
    ];
  }, [state, date]);

  return (
    <main className="app">
      <section className="hero compact">
        <p>马术俱乐部 · 蹄铁师巡诊排程</p>
        <h1>蹄铁巡诊排程</h1>
        <span>
          每匹马只保留一张未完成巡诊单；同马房每天最多两匹，上次装蹄未满十四天或缺少蹄铁记录不排入，
          加急单只能占用剩余位置。完成巡诊后写换蹄结论，原安排、当天路线和历次记录均可随时回看。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <button
          className="reset"
          onClick={() => {
            if (window.confirm("恢复演示档案？当前改动会被清除。")) archive.resetDemo();
          }}
        >
          重置演示数据
        </button>
      </nav>

      {tab === "route" && <RouteView date={date} onDateChange={setDate} />}
      {tab === "decision" && <DecisionView date={date} />}
      {tab === "archive" && <ArchiveView />}
      {tab === "history" && <HistoryView />}
    </main>
  );
}

export default App;
