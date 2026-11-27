// كارت "خطة النهارده": من بيانات الجهاز بس، ولو مفيش بيانات بيظهر نص فاضي
import { buildPlan } from "../core/daily-plan.ts";
import type { PlanItem, PlanLevel } from "../core/daily-plan.ts";
import { toDateKey } from "../core/analytics.ts";
import { dosesForDay } from "../core/medications.ts";
import { getLocale } from "./i18n.ts";
import { store } from "./storage.ts";
import { readMedications } from "./med-store.ts";
import { readMeals, totalSince } from "./food.ts";
import { exerciseName } from "./exercise-copy.ts";
import { activeDayStreak, daysSinceLastSession, quickStartExerciseId } from "../core/engagement.ts";

type Pair = readonly [string, string];
const TITLE: Pair = ["خطة النهارده", "Today's plan"];
const EMPTY: Pair = ["سجّل نومك وحالتك من تبويب التقدم، وأنا أقترح عليك شدة تمرين النهارده.", "Log your sleep and mood in the Progress tab and I will suggest today's workout intensity."];
const NOTE: Pair = ["قواعد بسيطة من بيانات جهازك. مش نصيحة طبية.", "Simple rules from your on-device data. Not medical advice."];
const LEVEL: Record<Exclude<PlanLevel, "none">, Pair> = {
  rest: ["النهارده: راحة أو إطالة خفيفة", "Today: rest or light stretching"],
  light: ["النهارده: تمرين خفيف", "Today: a light workout"],
  normal: ["النهارده: تمرين عادي", "Today: a normal workout"],
};
const ITEM: Record<PlanItem["id"], (n?: number) => Pair> = {
  lowSleep: () => ["نمت أقل من 6 ساعات.", "You slept under 6 hours."],
  highStress: () => ["التوتر عالي النهارده.", "Stress is high today."],
  lowMood: () => ["المزاج واطي النهارده.", "Mood is low today."],
  hardYesterday: () => ["امبارح كان تمرينك تقيل.", "Yesterday's workout was heavy."],
  painYesterday: () => ["امبارح سجلت ألم. ارتاح، ولو الألم مستمر كلّم دكتور.", "You logged pain yesterday. Rest, and see a doctor if it continues."],
  goodRecovery: () => ["نومك كويس والتوتر قليل.", "Good sleep and low stress."],
  dataOkNoFlags: () => ["مفيش حاجة في بياناتك بتستدعي تخفيف.", "Nothing in your data calls for going lighter."],
  medsPending: (n) => [`فيه ${n} جرعة ميعادها عدّى ولسه ما سجلتهاش.`, `${n} dose(s) are due and not logged yet.`],
  medsAllDone: () => ["جرعات النهارده اللي ميعادها عدّى متسجلة.", "Today's due doses are logged."],
  foodNone: () => ["لسه ما سجلتش أكل النهارده.", "You have not logged any food today."],
  foodLogged: (n) => [`سجلت ${n} وجبة النهارده.`, `You logged ${n} meal(s) today.`],
};
const SLEEP_Q: Pair = ["نمت كام ساعة؟", "How long did you sleep?"];
const MOOD_Q: Pair = ["مزاجك عامل إزاي؟", "How is your mood?"];
const SLEEP_OPTS: { hours: number; label: Pair }[] = [
  { hours: 5, label: ["أقل من 6", "<6h"] },
  { hours: 7, label: ["6–8", "6–8h"] },
  { hours: 9, label: ["أكتر من 8", ">8h"] },
];
const MOOD_OPTS: { mood: number; label: Pair }[] = [
  { mood: 1, label: ["وحش", "Bad"] },
  { mood: 3, label: ["وسط", "Okay"] },
  { mood: 5, label: ["كويس", "Good"] },
];
const SUGGESTED: Pair = ["تمرين مقترح", "Suggested"];
const STREAK = (n: number): Pair => [`🔥 ${n} ${n === 1 ? "يوم" : "أيام"} ورا بعض`, `🔥 ${n}-day streak`];
const NUDGE_FIRST: Pair = ["ابدأ أول تمرين ليك النهارده 💪", "Start your first workout today 💪"];
const NUDGE_RETURN = (n: number): Pair => [`آخر تمرين ليك من ${n} ${n === 1 ? "يوم" : "أيام"} — يلا نرجع 💪`, `Last workout was ${n} day(s) ago - let's get back 💪`];
const QUICK_START = (name: string): Pair => [`ابدأ الآن: ${name}`, `Start now: ${name}`];
const START: Pair = ["ابدأ", "Start"];
// التمرين المقترح حسب شدة النهارده: خفيف = حركة هادية، عادي = سكوات
const SUGGESTION_BY_LEVEL: Partial<Record<PlanLevel, string>> = { light: "sit_to_stand", normal: "squat" };
const pick = (p: Pair): string => p[getLocale() === "en" ? 1 : 0];

// نفس حساب الكارت بس من غير DOM: بيستخدمه picker عشان يميّز التمرين المقترح
export function suggestedExerciseId(): string | null {
  const now = new Date();
  const checkin = store.getCheckins()[toDateKey(now)];
  const hasCheckin = !!checkin && (checkin.sleepHours !== undefined || checkin.stress !== undefined || checkin.mood !== undefined);
  if (!hasCheckin) return null;
  const yKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const yesterday = store.getSessions().filter((s) => !s.deleted && toDateKey(new Date(s.at)) === yKey);
  const plan = buildPlan({
    sleepHours: checkin?.sleepHours, stress: checkin?.stress, mood: checkin?.mood,
    yesterday: yesterday.map((s) => ({ goodReps: s.goodReps, badReps: s.badReps, holdSeconds: s.holdSeconds, pain: s.pain })),
    meds: { total: 0, pendingDue: 0 }, mealsToday: null, hour: now.getHours(),
  });
  return SUGGESTION_BY_LEVEL[plan.level] ?? null;
}

// تسجيل بضغطة واحدة: بيدمج مع أي بيانات موجودة لليوم وبيحدّث الكروت
function quickCheckin(patch: { sleepHours?: number; mood?: number }): void {
  const key = toDateKey(new Date());
  const current = store.getCheckins()[key] ?? {};
  store.saveCheckin(key, { ...current, ...patch });
  window.dispatchEvent(new Event("healthmate:refresh"));
  renderDailyPlan();
}

export function renderDailyPlan(): void {
  const tab = document.getElementById("tab-workout");
  const anchor = document.getElementById("cards");
  if (!tab || !anchor) return;
  let card = document.getElementById("daily-plan-card");
  if (!card) {
    card = document.createElement("section");
    card.id = "daily-plan-card"; card.className = "panel daily-plan";
    anchor.before(card);
  }
  const now = new Date();
  const yKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const checkin = store.getCheckins()[toDateKey(now)];
  const sessions = store.getSessions().filter((s) => !s.deleted && toDateKey(new Date(s.at)) === yKey);
  const doses = dosesForDay(readMedications(), now);
  const pendingDue = doses.filter((d) => (d.status === undefined || d.status === "cleared") && d.dueAt.getTime() <= now.getTime()).length;
  const meals = readMeals();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayMeals = meals.length === 0 ? null : (totalSince(meals, startOfDay)?.count ?? 0);
  const plan = buildPlan({
    sleepHours: checkin?.sleepHours, stress: checkin?.stress, mood: checkin?.mood,
    yesterday: sessions.map((s) => ({ goodReps: s.goodReps, badReps: s.badReps, holdSeconds: s.holdSeconds, pain: s.pain })),
    meds: { total: doses.length, pendingDue },
    mealsToday: todayMeals,
    hour: now.getHours(),
  });
  card.replaceChildren();
  const h = document.createElement("h2"); h.textContent = pick(TITLE); card.append(h);

  // تحفيز بدون أي احتكاك: سلسلة الأيام + تذكير لطيف + زرار بدء بضغطة واحدة
  const allSessions = store.getSessions().filter((s) => !s.deleted);
  const streak = activeDayStreak(allSessions, Date.now());
  if (streak >= 1) {
    const chip = document.createElement("p");
    chip.className = "streak-chip";
    chip.textContent = pick(STREAK(streak));
    card.append(chip);
  }
  const gap = daysSinceLastSession(allSessions, Date.now());
  if (gap === null || gap >= 2) {
    const nudge = document.createElement("p");
    nudge.className = "hint nudge-line";
    nudge.textContent = gap === null ? pick(NUDGE_FIRST) : pick(NUDGE_RETURN(gap));
    card.append(nudge);
  }
  const quickId = quickStartExerciseId(allSessions, suggestedExerciseId());
  const quick = document.createElement("button");
  quick.type = "button";
  quick.className = "btn primary quick-start";
  quick.textContent = pick(QUICK_START(exerciseName(quickId)));
  quick.onclick = () => window.dispatchEvent(new CustomEvent("healthmate:quick-start", { detail: quickId }));
  card.append(quick);


  // التسجيل جوه الكارت نفسه بضغطتين: النوم والمزاج. بعدها تظهر الشدة والتمرين المقترح.
  const missingSleep = checkin?.sleepHours === undefined;
  const missingMood = checkin?.mood === undefined;
  if (missingSleep || missingMood) {
    const box = document.createElement("div"); box.className = "daily-plan-checkin";
    if (missingSleep) {
      const row = document.createElement("div"); row.className = "checkin-row";
      const label = document.createElement("span"); label.textContent = pick(SLEEP_Q); row.append(label);
      const seg = document.createElement("div"); seg.className = "seg checkin-seg";
      for (const o of SLEEP_OPTS) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = pick(o.label);
        b.onclick = () => quickCheckin({ sleepHours: o.hours });
        seg.append(b);
      }
      row.append(seg); box.append(row);
    }
    if (missingMood) {
      const row = document.createElement("div"); row.className = "checkin-row";
      const label = document.createElement("span"); label.textContent = pick(MOOD_Q); row.append(label);
      const seg = document.createElement("div"); seg.className = "seg checkin-seg";
      for (const o of MOOD_OPTS) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = pick(o.label);
        b.onclick = () => quickCheckin({ mood: o.mood });
        seg.append(b);
      }
      row.append(seg); box.append(row);
    }
    card.append(box);
    const note = document.createElement("p"); note.className = "hint"; note.textContent = pick(NOTE); card.append(note);
    return;
  }

  if (plan.level !== "none") {
    const lv = document.createElement("p"); lv.className = `daily-plan-level is-${plan.level}`; lv.textContent = pick(LEVEL[plan.level]); card.append(lv);
  } else {
    const p = document.createElement("p"); p.className = "hint"; p.textContent = pick(EMPTY); card.append(p);
  }
  if (plan.items.length > 0) {
    const ul = document.createElement("ul"); ul.className = "daily-plan-list";
    for (const it of plan.items) { const li = document.createElement("li"); li.textContent = pick(ITEM[it.id](it.n)); ul.append(li); }
    card.append(ul);
  }
  const suggested = suggestedExerciseId();
  if (suggested) {
    const row = document.createElement("div"); row.className = "daily-plan-suggest";
    const label = document.createElement("span");
    label.innerHTML = `<b></b>`;
    label.querySelector("b")!.textContent = `${pick(SUGGESTED)}: ${exerciseName(suggested)}`;
    const go = document.createElement("button"); go.type = "button"; go.className = "btn primary suggest-start"; go.textContent = pick(START);
    go.onclick = () => window.dispatchEvent(new CustomEvent("healthmate:start-exercise", { detail: suggested }));
    row.append(label, go);
    card.append(row);
  }
  const note = document.createElement("p"); note.className = "hint"; note.textContent = pick(NOTE); card.append(note);
}

export function initDailyPlan(): void {
  renderDailyPlan();
  window.addEventListener("healthmate:refresh", renderDailyPlan);
  window.addEventListener("healthmate:locale", renderDailyPlan);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderDailyPlan(); });
}
