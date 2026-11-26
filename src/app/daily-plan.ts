// كارت "خطة النهارده": من بيانات الجهاز بس، ولو مفيش بيانات بيظهر نص فاضي
import { buildPlan } from "../core/daily-plan.ts";
import type { PlanItem, PlanLevel } from "../core/daily-plan.ts";
import { toDateKey } from "../core/analytics.ts";
import { dosesForDay } from "../core/medications.ts";
import { getLocale } from "./i18n.ts";
import { store } from "./storage.ts";
import { readMedications } from "./med-store.ts";
import { readMeals, totalSince } from "./food.ts";

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
const pick = (p: Pair): string => p[getLocale() === "en" ? 1 : 0];

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
  const note = document.createElement("p"); note.className = "hint"; note.textContent = pick(NOTE); card.append(note);
}

export function initDailyPlan(): void {
  renderDailyPlan();
  window.addEventListener("healthmate:refresh", renderDailyPlan);
  window.addEventListener("healthmate:locale", renderDailyPlan);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderDailyPlan(); });
}
