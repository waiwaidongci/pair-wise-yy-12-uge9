import { useMemo, useState } from "react";
import "./styles.css";
import { ScheduleView } from "./components/ScheduleView";
import { HorsesView } from "./components/HorsesView";
import { HistoryView } from "./components/HistoryView";
import { useArchive } from "./lib/archive";
import { dueState, todayISO } from "./lib/date";

const TABS = [
  { key: "schedule", label: "巡诊排程" },
  { key: "horses", label: "马匹与开单" },
  { key: "history", label: "历次记录" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function App() {
  const [tab, setTab] = useState<TabKey>("schedule");
  const state = useArchive();
  const today = todayISO();

  const metrics = useMemo(() => {
    const checkupDue = state.horses.filter((h) => {
      const s = dueState(h.checkupDue, today);
      return s === "overdue" || s === "due";
    }).length;
    const urgentOpen = state.orders.filter(
      (o) => o.priority === "urgent" && o.status !== "done"
    ).length;
    const todayPlan = state.plans.find((p) => p.date === today);
    const onRoute = todayPlan
      ? todayPlan.routes.reduce((sum, r) => sum + r.entries.length, 0)
      : 0;
    return [
      { label: "复查到期/逾期", value: checkupDue },
      { label: "未完成加急单", value: urgentOpen },
      { label: "今日路线马匹", value: onRoute },
      { label: "马匹档案", value: state.horses.length },
    ];
  }, [state, today]);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 蹄铁师巡诊工作台</p>
        <h1>巡诊排程</h1>
        <span>
          每天跑多个马房，加急与复查到期统一排程：每匹马只保留一张未完成巡诊单，
          记录马房、上次装蹄日期、蹄铁状态与复查到期；同一马房一天最多两匹，
          未满十四天或缺少蹄铁记录不排入，加急单只占剩余位置。完成后写入换蹄结论，
          原安排、当天路线和历次记录均可随时回查。
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
      </nav>

      {tab === "schedule" && <ScheduleView />}
      {tab === "horses" && <HorsesView />}
      {tab === "history" && <HistoryView />}
    </main>
  );
}

export default App;
