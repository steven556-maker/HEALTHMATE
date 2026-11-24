import { useEffect, useState, type CSSProperties } from "react";
import { buildDaySummaries, summarizeWeek } from "../../core/analytics.ts";
import type { SessionRecord } from "../../core/coach/rules.ts";
import { getLocale, t } from "../../app/i18n.ts";
import { medicationSummary as readMedicationSummary } from "../../app/medications.ts";
import { normalizeSession } from "../../core/merge.ts";

type Checkin = { weightKg?: number; sleepHours?: number; sleepQuality?: number };
type Range = "weekly" | "monthly";
function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}
function Metric({ label, value, detail, progress }: { label: string; value: string; detail: string; progress?: number | null }) {
  const style = { "--progress": `${Math.round((progress ?? 0) * 100)}%` } as CSSProperties;
  return <article className="health-metric">
    <div className="health-metric-top"><span>{label}</span>{progress !== undefined && <span className="health-metric-ring" style={style} aria-hidden="true"/>}</div>
    <strong>{value}</strong><small>{detail}</small>
  </article>;
}

export default function HealthDashboard() {
  const [range, setRange] = useState<Range>("weekly");
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    window.addEventListener("healthmate:refresh", update);
    window.addEventListener("healthmate:locale", update);
    return () => {
      window.removeEventListener("healthmate:refresh", update);
      window.removeEventListener("healthmate:locale", update);
    };
  }, []);

  const locale = getLocale();
  const daysCount = range === "weekly" ? 7 : 30;
  const checkins = readJson<Record<string, Checkin>>("hm.checkins", {});
  const sessions = readJson<unknown[]>("hm.sessions", []).map(normalizeSession).filter((row): row is NonNullable<ReturnType<typeof normalizeSession>> => row !== null && !row.deleted) as SessionRecord[];
  const days = buildDaySummaries(
    sessions,
    checkins,
    readMedicationSummary(), new Date(), daysCount,
  );
  const stats = summarizeWeek(days);
  const previousEnd = new Date(); previousEnd.setDate(previousEnd.getDate() - daysCount);
  const previousStats = summarizeWeek(buildDaySummaries(sessions, checkins, readMedicationSummary(), previousEnd, daysCount));
  const repetitions = days.map((day) => day.sessions.reduce((sum, session) => sum + session.goodReps + session.badReps, 0));
  const labels = days.map((day) => {
    const date = new Date(`${day.date}T00:00:00`);
    return range === "weekly"
      ? date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { weekday: "short" })
      : date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "numeric" });
  });
  const accuracy = stats.accuracy === null ? "—" : `${Math.round(stats.accuracy * 100)}%`;
  const adherence = stats.medsAdherence === null ? "—" : `${Math.round(stats.medsAdherence * 100)}%`;
  const averageSleep = stats.avgSleep === null ? "—" : `${stats.avgSleep.toFixed(1)} ${t("hoursUnit")}`;
  const totalReps = stats.goodReps + stats.badReps;
  const previousReps = previousStats.goodReps + previousStats.badReps;
  const allWeightEntries = Object.entries(checkins)
    .filter(([date, checkin]) => checkin.weightKg !== undefined && new Date(`${date}T00:00:00`).getTime() <= Date.now())
    .sort(([left], [right]) => left.localeCompare(right));
  const weightEntries = allWeightEntries
    .filter(([date, checkin]) => checkin.weightKg !== undefined && new Date(`${date}T00:00:00`).getTime() >= previousEnd.getTime() && new Date(`${date}T00:00:00`).getTime() <= Date.now())
    .slice(-daysCount);
  const weightValues = weightEntries.map(([, checkin]) => checkin.weightKg as number);
  const weightLabels = weightEntries.map(([date]) => new Date(`${date}T00:00:00`).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { day: "numeric", month: "short" }));
  const latestWeight = weightValues.at(-1);
  const previousWeight = allWeightEntries.filter(([date]) => new Date(`${date}T00:00:00`).getTime() < previousEnd.getTime()).at(-1)?.[1].weightKg;
  const points = repetitions.map((value, index) => {
    const x = 12 + (index * 336) / Math.max(1, repetitions.length - 1);
    const max = Math.max(1, ...repetitions);
    const y = 18 + 100 - (value / max) * 88;
    return `${x},${y}`;
  }).join(" ");

  return (
    <section className="health-dashboard" aria-label={t("healthSummary")}>
      <header className="health-dashboard-heading">
        <div><span className="health-dashboard-eyebrow">HEALTHMATE</span><h2>{t("healthSummary")}</h2></div>
        <div className="health-dashboard-range" role="group" aria-label={t("timeRange")}>
          {(["weekly", "monthly"] as const).map((item) => <button key={item} type="button" aria-pressed={range === item} onClick={() => setRange(item)}>{t(item)}</button>)}
        </div>
      </header>
      <div className="health-dashboard-metrics">
        <Metric label={t("repetitions")} value={String(totalReps)} detail={`${stats.goodReps} ${t("correctReps")} · ${stats.badReps} ${t("incorrectReps")}`} />
        <Metric label={t("formAccuracy")} value={accuracy} detail={`${stats.sessions} ${t("sessionsRecorded")}`} progress={stats.accuracy} />
        <Metric label={t("avgSleep")} value={averageSleep} detail={t("fromCheckins")} />
        <Metric label={t("medicationAdherence")} value={adherence} detail={t("fromMedicationLog")} progress={stats.medsAdherence} />
      </div>
      <div className="health-dashboard-chart">
        <h3>{t("repetitionsTrend")}</h3>
        <svg className="health-chart" viewBox="0 0 360 148" role="img" aria-label={t("repetitionsTrend")}>
          {[22, 56, 90, 124].map((y) => <line key={y} className="health-chart-grid" x1="12" x2="348" y1={y} y2={y} />)}
          <polyline className="health-chart-line" points={points} />
          {repetitions.map((value, index) => {
            const x = 12 + (index * 336) / Math.max(1, repetitions.length - 1);
            const max = Math.max(1, ...repetitions);
            const y = 118 - (value / max) * 88;
            const showLabel = range === "weekly" || index % 5 === 0 || index === repetitions.length - 1;
            return <g key={`${labels[index]}-${index}`}><circle className="health-chart-dot" cx={x} cy={y} r="3"/>{showLabel && <text className="health-chart-label" x={x} y="143" textAnchor="middle">{labels[index]}</text>}</g>;
          })}
        </svg>
        <p className="health-compare">{t("comparePerformance", { current: totalReps, previous: previousReps })}</p>
        <p className="health-dashboard-note">{t("deviceData")}</p>
      </div>
      <details className="disclosure health-weight-disclosure">
        <summary><span>{t("weightTrend")}</span><strong>{latestWeight === undefined ? "—" : `${latestWeight.toFixed(1)} ${t("kgUnit")}`}</strong></summary>
        {weightValues.length > 0 ? <>
          <svg className="health-chart weight-chart" viewBox="0 0 360 118" role="img" aria-label={t("weightTrend")}>
            {[18, 48, 78, 108].map((y) => <line key={y} className="health-chart-grid" x1="12" x2="348" y1={y} y2={y} />)}
            {weightValues.length > 1 && <polyline className="health-chart-line" points={weightValues.map((value, index) => `${12 + index * 336 / Math.max(1, weightValues.length - 1)},${18 + 84 - (value - Math.min(...weightValues)) / Math.max(1, Math.max(...weightValues) - Math.min(...weightValues)) * 72}`).join(" ")} />}
            {weightValues.map((value, index) => <circle key={`${weightLabels[index]}-${index}`} className="health-chart-dot" cx={12 + index * 336 / Math.max(1, weightValues.length - 1)} cy={18 + 84 - (value - Math.min(...weightValues)) / Math.max(1, Math.max(...weightValues) - Math.min(...weightValues)) * 72} r="3" />)}
          </svg>
          <p className="health-compare">{previousWeight === undefined ? t("weightNeedTwo") : t("weightComparison", { current: latestWeight!.toFixed(1), previous: previousWeight.toFixed(1) })}</p>
        </> : <p className="health-dashboard-note">{t("weightEmpty")}</p>}
      </details>
      <p className="health-dashboard-note">{t("healthDisclaimer")}</p>
    </section>
  );
}
