import type { DaySummary, SessionRecord } from "./coach/rules.ts";

export interface WeekStats {
  sessions: number;
  goodReps: number;
  badReps: number;
  accuracy: number | null; // 0..1
  holdSeconds: number;
  activeDays: number;
  avgSleep: number | null;
  medsAdherence: number | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizeWeek(days: DaySummary[]): WeekStats {
  const sessions: SessionRecord[] = days.flatMap((d) => d.sessions);
  const good = sessions.reduce((a, s) => a + s.goodReps, 0);
  const bad = sessions.reduce((a, s) => a + s.badReps, 0);
  const medsTotal = days.reduce((a, d) => a + d.medsTotal, 0);
  const medsTaken = days.reduce((a, d) => a + d.medsTaken, 0);
  return {
    sessions: sessions.length,
    goodReps: good,
    badReps: bad,
    accuracy: good + bad > 0 ? good / (good + bad) : null,
    holdSeconds: sessions.reduce((a, s) => a + s.holdSeconds, 0),
    activeDays: days.filter((d) => d.sessions.length > 0).length,
    avgSleep: avg(days.map((d) => d.sleepHours).filter((x): x is number => x !== undefined)),
    medsAdherence: medsTotal > 0 ? medsTaken / medsTotal : null,
  };
}

/** نسبة التغيّر بين أسبوعين. null لو مفيش أساس للمقارنة */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return Number.isFinite(change) ? change : null;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface CheckIn {
  sleepHours?: number;
  sleepQuality?: number;
  weightKg?: number;
  stress?: number;
  mood?: number;
  /** وقت آخر تعديل (ms). بيُستخدم في دمج الأجهزة. */
  updatedAt?: number;
}

/** يبني ملخصات آخر n يوم (الأقدم أولًا) من الجلسات والإدخالات اليومية */
export function buildDaySummaries(
  sessions: SessionRecord[],
  checkins: Record<string, CheckIn>,
  meds: Record<string, { taken: number; total: number }>,
  endDate: Date,
  n = 7,
): DaySummary[] {
  if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(endDate.getTime())) return [];
  const out: DaySummary[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - i);
    const key = toDateKey(d);
    const c = checkins[key] ?? {};
    const m = meds[key] ?? { taken: 0, total: 0 };
    out.push({
      date: key,
      sleepHours: c.sleepHours,
      sleepQuality: c.sleepQuality,
      weightKg: c.weightKg,
      stress: c.stress,
      mood: c.mood,
      sessions: sessions.filter((s) => !s.deleted && toDateKey(new Date(s.at)) === key),
      medsTaken: m.taken,
      medsTotal: m.total,
    });
  }
  return out;
}
