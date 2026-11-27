import { buildDaySummaries, summarizeWeek, toDateKey } from "../core/analytics.ts";
import { buildReportCsv, reportSince } from "../core/report.ts";
import { dateKey } from "../core/medications.ts";
import { getLocale, t } from "./i18n.ts";
import { exerciseName } from "./exercise-copy.ts";
import { readMedications } from "./med-store.ts";
import { readFeelings } from "./feelings.ts";
import { medicationSummary } from "./medications.ts";
import { store } from "./storage.ts";
import { $, showToast } from "./ui.ts";

// تقرير للطبيب أو أخصائي العلاج الطبيعي: ملف CSV، أو صفحة مطبوعة (الطباعة ← حفظ كـ PDF). مفيش فيديو ولا صور.
const DAYS = 30;

function csvLabels() {
  return {
    sessions: t("csvSessions"), medications: t("csvMedications"), checkins: t("csvCheckins"), taken: t("taken"), missed: t("missed"), yes: t("parqYes"),
    headers: {
      date: t("csvDate"), time: t("csvTime"), exercise: t("csvExercise"), good: t("csvGood"), bad: t("csvBad"), hold: t("csvHold"), pain: t("csvPain"),
      medication: t("csvMedication"), dose: t("csvDose"), status: t("csvStatus"), sleep: t("csvSleep"), sleepQuality: t("csvSleepQuality"),
      weight: t("csvWeight"), stress: t("csvStress"), mood: t("csvMood"),
    },
  };
}

export function exportCsv(): void {
  const now = new Date();
  const csv = buildReportCsv({ sessions: store.getSessions(), checkins: store.getCheckins(), medications: readMedications(), now, days: DAYS, exerciseLabel: exerciseName, labels: csvLabels() });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `healthmate-${toDateKey(now)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(t("csvDownloaded"));
}

function table(headers: string[], rows: string[][]): HTMLTableElement {
  const element = document.createElement("table");
  const head = element.createTHead().insertRow();
  for (const header of headers) { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = header; head.append(cell); }
  const body = element.createTBody();
  for (const row of rows) { const tr = body.insertRow(); for (const value of row) tr.insertCell().textContent = value; }
  return element;
}

export function printReport(): void {
  const now = new Date();
  const root = $("print-root");
  root.replaceChildren();
  const locale = getLocale() === "ar" ? "ar-EG" : "en-US";
  const since = reportSince(now, DAYS);
  const sessions = store.getSessions().filter((s) => s.at >= since.getTime()).sort((a, b) => a.at - b.at);
  const stats = summarizeWeek(buildDaySummaries(store.getSessions(), store.getCheckins(), medicationSummary(), now, DAYS));
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  const title = document.createElement("h1"); title.textContent = t("printReportTitle");
  const meta = document.createElement("p");
  meta.textContent = `${t("reportRangeDays", { days: DAYS })} · ${t("reportGenerated", { date: now.toLocaleDateString(locale, { dateStyle: "long" }) })}`;
  const summary = document.createElement("ul");
  for (const line of [
    t("reportSessionsCount", { count: stats.sessions }),
    t("reportAccuracyLine", { value: pct(stats.accuracy) }),
    t("reportActiveDays", { days: stats.activeDays }),
    t("reportAdherenceLine", { value: pct(stats.medsAdherence) }),
    t("reportSleep", { hours: stats.avgSleep === null ? "—" : stats.avgSleep.toFixed(1) }),
  ]) { const li = document.createElement("li"); li.textContent = line; summary.append(li); }

  const sessionsTitle = document.createElement("h2"); sessionsTitle.textContent = t("csvSessions");
  const sessionsTable = table(
    [t("csvDate"), t("csvExercise"), t("csvGood"), t("csvBad"), t("csvHold"), t("csvPain")],
    sessions.map((s) => [new Date(s.at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }), exerciseName(s.exerciseId), String(s.goodReps), String(s.badReps), String(s.holdSeconds), s.pain ? t("parqYes") : ""]),
  );

  const sinceKey = dateKey(since);
  const doseRows: string[][] = [];
  for (const med of readMedications()) {
    for (const [key, status] of Object.entries(med.log)) {
      if ((status === "taken" || status === "missed") && key.slice(0, 10) >= sinceKey) doseRows.push([key.slice(0, 10), key.slice(11), med.name, med.dose, t(status)]);
    }
  }
  doseRows.sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));
  const medsTitle = document.createElement("h2"); medsTitle.textContent = t("csvMedications");
  const medsTable = table([t("csvDate"), t("csvTime"), t("csvMedication"), t("csvDose"), t("csvStatus")], doseRows);

  const feelingKey: Record<string, Parameters<typeof t>[0]> = { good: "feelingGood", tired: "feelingTired", unwell: "feelingUnwell" };
  const feelingRows = readFeelings().filter((f) => f.at >= since.getTime()).map((f) => [
    new Date(f.at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }),
    exerciseName(f.exerciseId),
    t(feelingKey[f.feeling] ?? "feelingGood"),
  ]);
  const feelingsTitle = document.createElement("h2"); feelingsTitle.textContent = t("csvFeelings");
  const feelingsTable = table([t("csvDate"), t("csvExercise"), t("csvFeeling")], feelingRows);

  const disclaimer = document.createElement("p"); disclaimer.className = "print-disclaimer"; disclaimer.textContent = t("reportDisclaimer");
  root.append(title, meta, summary, sessionsTitle, sessionsTable, medsTitle, medsTable, feelingsTitle, feelingsTable, disclaimer);
  window.print();
}
