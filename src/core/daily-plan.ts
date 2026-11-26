// خطة النهارده: قواعد بسيطة (مش ذكاء اصطناعي ومش نصيحة طبية)
// لو مفيش بيانات بنرجّع "none". الأدوية تذكير بس

export type PlanLevel = "none" | "rest" | "light" | "normal";

export type PlanItemId =
  | "lowSleep" | "highStress" | "lowMood" | "hardYesterday" | "painYesterday"
  | "goodRecovery" | "dataOkNoFlags"
  | "medsPending" | "medsAllDone"
  | "foodNone" | "foodLogged";

export interface PlanItem { id: PlanItemId; n?: number }

export interface PlanInput {
  sleepHours?: number;
  stress?: number; // 1..5
  mood?: number; // 1..5
  // جلسات امبارح
  yesterday: { goodReps: number; badReps: number; holdSeconds: number; pain?: boolean }[];
  // جرعات النهارده: الإجمالي وعدد اللي ميعادها عدّى ولسه ما اتسجلتش
  meds: { total: number; pendingDue: number };
  // عدد وجبات النهارده، و null لو تتبع الأكل مش مستخدم
  mealsToday: number | null;
  // الساعة الحالية 0..23
  hour: number;
}

export interface Plan { level: PlanLevel; items: PlanItem[] }

export const PLAN_THRESHOLDS = {
  lowSleep: 6,
  highStress: 4,
  lowMood: 2,
  hardDayReps: 40,
  hardDayHoldSec: 120,
  foodReminderHour: 14,
  goodSleep: 7,
  lowStress: 2,
} as const;

const known = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function buildPlan(i: PlanInput): Plan {
  const items: PlanItem[] = [];
  let level: PlanLevel = "none";
  const hasCheckin = known(i.sleepHours) || known(i.stress) || known(i.mood);
  const hadYesterday = i.yesterday.length > 0;

  if (hasCheckin || hadYesterday) {
    level = "normal";
    const light: PlanItemId[] = [];
    if (known(i.sleepHours) && i.sleepHours >= 0 && i.sleepHours < PLAN_THRESHOLDS.lowSleep) light.push("lowSleep");
    if (known(i.stress) && i.stress >= PLAN_THRESHOLDS.highStress) light.push("highStress");
    if (known(i.mood) && i.mood <= PLAN_THRESHOLDS.lowMood) light.push("lowMood");
    const reps = i.yesterday.reduce((n, s) => n + s.goodReps + s.badReps, 0);
    const hold = i.yesterday.reduce((n, s) => n + s.holdSeconds, 0);
    if (reps >= PLAN_THRESHOLDS.hardDayReps || hold >= PLAN_THRESHOLDS.hardDayHoldSec) light.push("hardYesterday");
    const pain = i.yesterday.some((s) => s.pain);
    if (pain) {
      level = "rest";
      items.push({ id: "painYesterday" });
    }
    if (light.length > 0) {
      if (level !== "rest") level = "light";
      items.push(...light.map((id) => ({ id })));
    } else if (level !== "rest") {
      const goodSleep = known(i.sleepHours) && i.sleepHours >= PLAN_THRESHOLDS.goodSleep;
      const calm = !known(i.stress) || i.stress <= PLAN_THRESHOLDS.lowStress;
      items.push({ id: goodSleep && calm ? "goodRecovery" : "dataOkNoFlags" });
    }
  }

  if (i.meds.total > 0) {
    items.push(i.meds.pendingDue > 0 ? { id: "medsPending", n: i.meds.pendingDue } : { id: "medsAllDone" });
  }
  if (i.mealsToday !== null) {
    if (i.mealsToday === 0 && i.hour >= PLAN_THRESHOLDS.foodReminderHour) items.push({ id: "foodNone" });
    else if (i.mealsToday > 0) items.push({ id: "foodLogged", n: i.mealsToday });
  }
  return { level, items };
}
