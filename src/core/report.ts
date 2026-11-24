// تقرير للطبيب/أخصائي العلاج الطبيعي: CSV (وتتطبع كـ PDF من المتصفح). دوال صافية.
import { toDateKey } from "./analytics.ts";
import type { CheckIn } from "./analytics.ts";
import type { SessionRecord } from "./coach/rules.ts";
import type { Medication } from "./medications.ts";

/** يمنع حقن الصيغ في Excel (=, +, -, @) ويهرّب الفاصلة والاقتباس. القيم اللي بيكتبها المستخدم (اسم الدواء مثلًا) لازم تعدّي من هنا. */
export function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const row = (cells: unknown[]) => cells.map(csvCell).join(",");

export interface ReportInput {
  sessions: SessionRecord[];
  checkins: Record<string, CheckIn>;
  medications: Medication[];
  now: Date;
  days: number;
  exerciseLabel: (id: string) => string;
  labels: { sessions: string; medications: string; checkins: string; headers: Record<"date" | "time" | "exercise" | "good" | "bad" | "hold" | "pain" | "medication" | "dose" | "status" | "sleep" | "sleepQuality" | "weight" | "stress" | "mood", string>; taken: string; missed: string; yes: string };
}

export function reportSince(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

export function buildReportCsv(input: ReportInput): string {
  const { labels: L } = input;
  const since = reportSince(input.now, input.days).getTime();
  const sessions = input.sessions.filter((s) => s.at >= since).sort((a, b) => a.at - b.at);
  const lines: string[] = [];
  lines.push(row([L.sessions]), row([L.headers.date, L.headers.time, L.headers.exercise, L.headers.good, L.headers.bad, L.headers.hold, L.headers.pain]));
  for (const s of sessions) {
    const d = new Date(s.at);
    lines.push(row([toDateKey(d), `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, input.exerciseLabel(s.exerciseId), s.goodReps, s.badReps, s.holdSeconds, s.pain ? L.yes : ""]));
  }
  lines.push("", row([L.medications]), row([L.headers.date, L.headers.time, L.headers.medication, L.headers.dose, L.headers.status]));
  const doses: { key: string; med: Medication; status: "taken" | "missed" }[] = [];
  for (const med of input.medications) {
    if (med.deleted) continue;
    for (const [key, status] of Object.entries(med.log)) {
      if ((status === "taken" || status === "missed") && key.slice(0, 10) >= toDateKey(new Date(since))) doses.push({ key, med, status });
    }
  }
  doses.sort((a, b) => a.key.localeCompare(b.key) || a.med.name.localeCompare(b.med.name));
  for (const dose of doses) lines.push(row([dose.key.slice(0, 10), dose.key.slice(11), dose.med.name, dose.med.dose, dose.status === "taken" ? L.taken : L.missed]));
  lines.push("", row([L.checkins]), row([L.headers.date, L.headers.sleep, L.headers.sleepQuality, L.headers.weight, L.headers.stress, L.headers.mood]));
  for (const date of Object.keys(input.checkins).sort()) {
    if (date < toDateKey(new Date(since))) continue;
    const c = input.checkins[date];
    lines.push(row([date, c.sleepHours, c.sleepQuality, c.weightKg, c.stress, c.mood]));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n"; // BOM عشان Excel يقرا العربي صح
}
