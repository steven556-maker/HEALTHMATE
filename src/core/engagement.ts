/**
 * حسابات التحفيز (streak + أرقام قياسية + المكسب الصغير بعد كل جلسة).
 * دوال نقية من بيانات الجلسات المحلية بس — مفيش أي احتكاك في مسار بدء التمرين.
 */

export interface SessionLike {
  at: number;
  exerciseId?: string;
  goodReps?: number;
  holdSeconds?: number;
  deleted?: boolean;
}

const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** عدد الأيام المتتالية اللي فيها جلسة واحدة على الأقل، منتهية النهارده أو امبارح. */
export function activeDayStreak(sessions: SessionLike[], now: number): number {
  const days = new Set(sessions.filter((s) => !s.deleted).map((s) => dayKey(s.at)));
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

/** عدد الأيام من آخر جلسة (0 = النهارده)، أو null لو مفيش جلسات خالص. */
export function daysSinceLastSession(sessions: SessionLike[], now: number): number | null {
  const live = sessions.filter((s) => !s.deleted);
  if (live.length === 0) return null;
  const last = Math.max(...live.map((s) => s.at));
  const a = new Date(last), b = new Date(now);
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** أفضل نتيجة سابقة لنفس التمرين (عدات أو ثواني ثبات)، أو null لو أول مرة. */
export function personalBest(sessions: SessionLike[], exerciseId: string, mode: "reps" | "hold"): number | null {
  const mine = sessions.filter((s) => !s.deleted && s.exerciseId === exerciseId);
  if (mine.length === 0) return null;
  return Math.max(...mine.map((s) => (mode === "hold" ? Math.round(s.holdSeconds ?? 0) : (s.goodReps ?? 0))));
}

export type Win =
  | { kind: "personal_best" }
  | { kind: "streak"; days: number }
  | { kind: "first" }
  | { kind: "done" };

/**
 * المكسب الصغير بعد الجلسة: رقم قياسي أولًا، بعدين استمرار السلسلة، بعدين أول مرة، وإلا تهنئة عادية.
 * sessions = الجلسات قبل حفظ الجلسة الحالية.
 */
export function detectWin(input: {
  exerciseId: string;
  mode: "reps" | "hold";
  goodReps: number;
  holdSeconds: number;
  sessions: SessionLike[];
  now: number;
}): Win {
  const mine = input.mode === "hold" ? Math.round(input.holdSeconds) : input.goodReps;
  const best = personalBest(input.sessions, input.exerciseId, input.mode);
  if (best !== null && mine > best) return { kind: "personal_best" };
  const before = activeDayStreak(input.sessions, input.now);
  const after = activeDayStreak([...input.sessions, { at: input.now }], input.now);
  if (after >= 2 && after > before) return { kind: "streak", days: after };
  if (best === null) return { kind: "first" };
  return { kind: "done" };
}

/** تمرين البدء السريع: المقترح، وإلا آخر تمرين اتعمل، وإلا سكوات. */
export function quickStartExerciseId(sessions: SessionLike[], suggested: string | null): string {
  if (suggested) return suggested;
  const live = sessions.filter((s) => !s.deleted && s.exerciseId);
  if (live.length > 0) return live.reduce((a, b) => (a.at > b.at ? a : b)).exerciseId!;
  return "squat";
}
