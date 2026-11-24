// المدرب الصحي المتكيف: قواعد واضحة (مش ML). كل اقتراح معاه "سبب" مكتوب يتعرض للمستخدم.
// ممنوع تمامًا: اقتراح جرعات أو تعديل أدوية أو أي نصيحة دوائية. القواعد دي بتخص التمرين والروتين بس.

export interface SessionRecord {
  exerciseId: string;
  goodReps: number;
  badReps: number;
  holdSeconds: number;
  /** المستخدم ضغط "حاسس بألم" وأوقف الجلسة. بيظهر في سجل الجلسات وتقرير الطبيب. */
  pain?: boolean;
  at: number; // وقت الجلسة (ms)
  /** هوية ثابتة للجلسة (للدمج بين الأجهزة). الجلسات القديمة من غير id بتاخد id مشتق. */
  id?: string;
  updatedAt?: number;
  /** tombstone: الجلسة اتحذفت. لازم تتفلتر من أي عرض أو حساب. */
  deleted?: boolean;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD
  sleepHours?: number;
  sleepQuality?: number;
  weightKg?: number;
  stress?: number; // 1..5
  mood?: number; // 1..5
  sessions: SessionRecord[];
  medsTaken: number;
  medsTotal: number;
}

export type Severity = "info" | "care" | "warn";

export interface Suggestion {
  id: string;
  severity: Severity;
  title: string;
  reason: string; // ليه النظام اقترح كده (قابل للشرح للجنة)
  action?: "lighter" | "rest" | "short_session" | "easy_mode" | "anchor_meds" | "level_up";
}

export interface CoachContext {
  days: DaySummary[]; // آخر 7 أيام، الأقدم أولًا، آخر عنصر = النهارده
}

export interface Rule {
  id: string;
  evaluate: (ctx: CoachContext) => Suggestion | null;
}

export const THRESHOLDS = {
  lowSleep: 6,
  highStress: 4,
  idleDays: 3,
  badRepRatio: 0.3,
  minRepsForRatio: 6,
  medsAdherence: 0.7,
  minMedsForAdherence: 3,
  levelUpAccuracy: 0.8,
} as const;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const accuracy = (s: SessionRecord): number | null => {
  const total = s.goodReps + s.badReps;
  return total > 0 ? s.goodReps / total : null;
};

const lowSleepOrStress: Rule = {
  id: "low_sleep_or_stress",
  evaluate({ days }) {
    const today = days[days.length - 1];
    if (!today) return null;
    const lowSleep = Number.isFinite(today.sleepHours) && today.sleepHours! >= 0 && today.sleepHours! < THRESHOLDS.lowSleep;
    const highStress = Number.isFinite(today.stress) && today.stress! >= THRESHOLDS.highStress;
    if (!lowSleep && !highStress) return null;
    const why: string[] = [];
    if (lowSleep) why.push(`نمت ${today.sleepHours} ساعات (أقل من ${THRESHOLDS.lowSleep})`);
    if (highStress) why.push(`سجّلت إجهاد ${today.stress} من 5`);
    return {
      id: "low_sleep_or_stress",
      severity: "care",
      title: "النهارده خفّف أو ارتاح",
      reason: `${why.join(" و")}. الجسم محتاج استشفاء، فتمرين أخف أو يوم راحة أنسب من الالتزام الأعمى بالجدول.`,
      action: lowSleep && highStress ? "rest" : "lighter",
    };
  },
};

const idleDays: Rule = {
  id: "idle_days",
  evaluate({ days }) {
    const recent = days.slice(-THRESHOLDS.idleDays);
    if (recent.length < THRESHOLDS.idleDays) return null;
    const idle = recent.every((d) => d.sessions.length === 0);
    if (!idle) return null;
    return {
      id: "idle_days",
      severity: "info",
      title: "جلسة قصيرة 10 دقايق",
      reason: `ما اتمرّنتش من ${THRESHOLDS.idleDays} أيام. جلسة قصيرة أسهل في الرجوع للروتين من جلسة طويلة.`,
      action: "short_session",
    };
  },
};

const highErrorRate: Rule = {
  id: "high_error_rate",
  evaluate({ days }) {
    const byEx = new Map<string, { good: number; bad: number }>();
    for (const d of days)
      for (const s of d.sessions) {
        const e = byEx.get(s.exerciseId) ?? { good: 0, bad: 0 };
        e.good += s.goodReps;
        e.bad += s.badReps;
        byEx.set(s.exerciseId, e);
      }
    let worst: { id: string; ratio: number } | null = null;
    for (const [id, { good, bad }] of byEx) {
      const total = good + bad;
      if (total < THRESHOLDS.minRepsForRatio) continue;
      const ratio = bad / total;
      if (ratio > THRESHOLDS.badRepRatio && (!worst || ratio > worst.ratio)) worst = { id, ratio };
    }
    if (!worst) return null;
    return {
      id: `high_error_rate:${worst.id}`,
      severity: "warn",
      title: "ركّز على الشكل مش العدد",
      reason: `${Math.round(worst.ratio * 100)}% من تكراراتك في هذا التمرين كانت بوضعية غلط (الحد ${Math.round(
        THRESHOLDS.badRepRatio * 100,
      )}%). قلّل العدد وجرّب الوضع السهل لحد ما الشكل يتحسن.`,
      action: "easy_mode",
    };
  },
};

const lowMedsAdherence: Rule = {
  id: "low_meds_adherence",
  evaluate({ days }) {
    const total = sum(days.map((d) => Number.isFinite(d.medsTotal) && d.medsTotal > 0 ? d.medsTotal : 0));
    if (total < THRESHOLDS.minMedsForAdherence) return null;
    const taken = sum(days.map((d) => Number.isFinite(d.medsTaken) ? Math.max(0, Math.min(d.medsTaken, d.medsTotal)) : 0));
    const rate = taken / total;
    if (rate >= THRESHOLDS.medsAdherence) return null;
    return {
      id: "low_meds_adherence",
      severity: "care",
      title: "اربط التذكير بروتين يومي",
      reason: `التزامك بمواعيد الأدوية ${Math.round(rate * 100)}% الأسبوع ده (أقل من ${Math.round(
        THRESHOLDS.medsAdherence * 100,
      )}%). ربط التذكير بحاجة ثابتة زي الفطار بيساعد. مواعيد وجرعات الدواء تفضل زي وصفة الطبيب بالظبط.`,
      action: "anchor_meds",
    };
  },
};

const steadyImprovement: Rule = {
  id: "steady_improvement",
  evaluate({ days }) {
    const byEx = new Map<string, SessionRecord[]>();
    for (const d of days)
      for (const s of d.sessions) {
        const list = byEx.get(s.exerciseId) ?? [];
        list.push(s);
        byEx.set(s.exerciseId, list);
      }
    for (const [, list] of byEx) {
      const accs = list
        .slice()
        .sort((a, b) => a.at - b.at)
        .map(accuracy)
        .filter((a): a is number => a !== null)
        .slice(-3);
      if (accs.length < 3) continue;
      if (accs[0] < accs[1] && accs[1] < accs[2] && accs[2] >= THRESHOLDS.levelUpAccuracy) {
        return {
          id: "steady_improvement",
          severity: "info",
          title: "جاهز لتحدي أعلى",
          reason: `دقتك اتحسنت 3 جلسات ورا بعض (${accs.map((a) => Math.round(a * 100) + "%").join(" ← ")}). ممكن تزوّد عدد التكرارات أو تجرّب الوضع العادي.`,
          action: "level_up",
        };
      }
    }
    return null;
  },
};

export const RULES: Rule[] = [lowSleepOrStress, highErrorRate, lowMedsAdherence, idleDays, steadyImprovement];

const ORDER: Record<Severity, number> = { warn: 0, care: 1, info: 2 };

/** يشغّل كل القواعد ويرجّع الاقتراحات مرتبة بالأهمية */
export function runCoach(ctx: CoachContext, rules: Rule[] = RULES): Suggestion[] {
  return rules
    .map((r) => r.evaluate(ctx))
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
