// السلاسل والأهداف الأسبوعية والشارات. دوال صافية. الهدف: تشجيع الاستمرار من غير ضغط أو إحساس بالذنب.
import { toDateKey } from "./analytics.ts";

export interface ActivityRecord { at: number; goodReps: number; badReps?: number; deleted?: boolean }

export const DEFAULT_WEEKLY_GOAL = 3;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function activeDays(records: ActivityRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) if (!r.deleted && Number.isFinite(r.at)) out.add(toDateKey(new Date(r.at)));
  return out;
}

/** الأيام المتتالية لحد النهارده. لو النهارده لسه ماتمرّنش، السلسلة مستمرة لو امبارح كان فيه تمرين. */
export function currentStreak(days: Set<string>, today: Date): number {
  let cursor = dayStart(today);
  if (!days.has(toDateKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(toDateKey(cursor))) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev: Date | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    run = prev && toDateKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** بداية الأسبوع الاثنين (زي جدول الروتين) */
export function weekStart(d: Date): Date { return addDays(dayStart(d), -((d.getDay() + 6) % 7)); }

export function weekProgress(days: Set<string>, today: Date, goal: number): { done: number; goal: number; reached: boolean } {
  const start = weekStart(today);
  let done = 0;
  for (let i = 0; i < 7; i++) if (days.has(toDateKey(addDays(start, i)))) done++;
  const g = Math.min(7, Math.max(1, Math.round(goal) || DEFAULT_WEEKLY_GOAL));
  return { done, goal: g, reached: done >= g };
}

function anyWeekReached(days: Set<string>, goal: number): boolean {
  const perWeek = new Map<string, number>();
  for (const key of days) {
    const [y, m, d] = key.split("-").map(Number);
    const wk = toDateKey(weekStart(new Date(y, m - 1, d)));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }
  return [...perWeek.values()].some((n) => n >= goal);
}

export type BadgeId = "first_session" | "streak_3" | "streak_7" | "streak_30" | "weekly_goal" | "reps_100";
export const BADGE_ORDER: BadgeId[] = ["first_session", "streak_3", "streak_7", "streak_30", "weekly_goal", "reps_100"];

export function earnedBadges(records: ActivityRecord[], goal: number): BadgeId[] {
  const live = records.filter((r) => !r.deleted);
  const days = activeDays(live);
  const best = bestStreak(days);
  const g = Math.min(7, Math.max(1, Math.round(goal) || DEFAULT_WEEKLY_GOAL));
  const reps = live.reduce((sum, r) => sum + (Number.isFinite(r.goodReps) ? r.goodReps : 0), 0);
  const earned: BadgeId[] = [];
  if (live.length > 0) earned.push("first_session");
  if (best >= 3) earned.push("streak_3");
  if (best >= 7) earned.push("streak_7");
  if (best >= 30) earned.push("streak_30");
  if (anyWeekReached(days, g)) earned.push("weekly_goal");
  if (reps >= 100) earned.push("reps_100");
  return earned;
}
