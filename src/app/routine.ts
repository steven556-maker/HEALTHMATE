import { getLocale, t } from "./i18n.ts";
import type { SessionRecord } from "../core/coach/rules.ts";
import { notifyLocalDataChanged } from "./cloud-events.ts";
import { exerciseName } from "./exercise-copy.ts";

type Goal = "fitness" | "flexibility" | "strength" | "mobility";
type Level = "beginner" | "intermediate" | "advanced";
type Mode = "standard" | "senior" | "supported";
type Barrier = "" | "busy" | "fatigue" | "unclear" | "other";
interface RoutineSettings { goal: Goal; level: Level; minutes: 15 | 25 | 40; mode: Mode; barrier: Barrier; updatedAt?: number }
const KEY = "hm.routine";
const defaults: RoutineSettings = { goal: "fitness", level: "beginner", minutes: 25, mode: "standard", barrier: "" };
const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
function readSettings(): RoutineSettings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<RoutineSettings>;
    return {
      goal: ["fitness", "flexibility", "strength", "mobility"].includes(value.goal ?? "") ? value.goal! : defaults.goal,
      level: ["beginner", "intermediate", "advanced"].includes(value.level ?? "") ? value.level! : defaults.level,
      minutes: [15, 25, 40].includes(value.minutes ?? 0) ? value.minutes! : defaults.minutes,
      mode: ["standard", "senior", "supported"].includes(value.mode ?? "") ? value.mode! : defaults.mode,
      barrier: ["", "busy", "fatigue", "unclear", "other"].includes(value.barrier ?? "") ? value.barrier! : defaults.barrier,
      ...(Number.isFinite(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
    };
  } catch { return defaults; }
}
function readSessions(): SessionRecord[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem("hm.sessions") ?? "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is SessionRecord =>
      !!row && typeof row.exerciseId === "string" && Number.isFinite(row.at) &&
      Number.isFinite(row.goodReps) && row.goodReps >= 0 && Number.isFinite(row.badReps) && row.badReps >= 0 && row.deleted !== true,
    );
  } catch { return []; }
}
function readCheckins(): Record<string, { sleepHours?: number; sleepQuality?: number }> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("hm.checkins") ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, { sleepHours?: number; sleepQuality?: number }> : {};
  } catch { return {}; }
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function saveSettings(settings: RoutineSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...settings, updatedAt: Date.now() })); notifyLocalDataChanged(); } catch { /* Retain the selected values for this render. */ }
  window.dispatchEvent(new Event("healthmate:routine-updated"));
}
function sessionCount(settings: RoutineSettings): number {
  let count = settings.minutes === 15 ? 2 : settings.minutes === 40 ? 4 : 3;
  if (settings.level === "beginner" || settings.mode !== "standard") count = Math.min(count, 3);
  if (settings.mode === "senior" || settings.mode === "supported") count = Math.min(count, 2);
  return count;
}
/** تمارين الأسبوع حسب الهدف والوضع. الوضع المنخفض الشدة/المدعوم بيستخدم تمارين أخف على المفاصل (من غير ضغط وبلانك). */
function routineExercises(settings: RoutineSettings): string[] {
  if (settings.mode !== "standard") return ["sit_to_stand", "glute_bridge", "wall_sit"];
  switch (settings.goal) {
    case "strength": return ["squat", "pushup", "lunge", "glute_bridge"];
    case "flexibility":
    case "mobility": return ["glute_bridge", "wall_sit", "squat"];
    default: return ["squat", "plank", "pushup", "lunge"];
  }
}
function renderSchedule(): void {
  const settings = readSettings();
  const goal = $("routine-goal") as HTMLSelectElement;
  const level = $("routine-level") as HTMLSelectElement;
  const minutes = $("routine-minutes") as HTMLSelectElement;
  const mode = $("routine-mode") as HTMLSelectElement;
  const barrier = $("routine-barrier") as HTMLSelectElement;
  goal.value = settings.goal; level.value = settings.level; minutes.value = String(settings.minutes); mode.value = settings.mode; barrier.value = settings.barrier;

  const allSessions = readSessions();
  const now = new Date();
  const recentSessions = allSessions.filter((session) => Number.isFinite(session.at) && now.getTime() - session.at < 7 * 86400000 && now.getTime() >= session.at);
  const activeDays = new Set(recentSessions.map((session) => dateKey(new Date(session.at)))).size;
  const totalReps = recentSessions.reduce((sum, session) => sum + session.goodReps + session.badReps, 0);
  const goodReps = recentSessions.reduce((sum, session) => sum + session.goodReps, 0);
  const accuracy = totalReps > 0 ? goodReps / totalReps : null;
  const checkins = readCheckins();
  const recentSleep = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index);
    return checkins[dateKey(date)];
  }).filter((entry) => entry !== undefined);
  const sleepHours = recentSleep.map((entry) => entry.sleepHours).filter((hours): hours is number => Number.isFinite(hours));
  const sleepLow = (sleepHours.length > 0 && sleepHours.reduce((sum, hours) => sum + hours, 0) / sleepHours.length < 6)
    || recentSleep.some((entry) => entry.sleepQuality !== undefined && entry.sleepQuality <= 2);

  let count = sessionCount(settings);
  let adaptation: "adaptationMaintain" | "adaptationBarrierBusy" | "adaptationBarrierFatigue" | "adaptationBarrierUnclear" | "adaptationSleep" | "adaptationForm" | "adaptationProgress" = "adaptationMaintain";
  if (settings.barrier === "busy") { count = Math.min(count, 2); adaptation = "adaptationBarrierBusy"; }
  else if (settings.barrier === "fatigue") { count = Math.min(count, 2); adaptation = "adaptationBarrierFatigue"; }
  else if (settings.barrier === "unclear") { count = Math.min(count, 2); adaptation = "adaptationBarrierUnclear"; }
  else if (sleepLow) { count = Math.max(2, count - 1); adaptation = "adaptationSleep"; }
  else if (accuracy !== null && totalReps >= 5 && accuracy < 0.65) { count = Math.max(2, count - 1); adaptation = "adaptationForm"; }
  else if (activeDays >= count - 1 && accuracy !== null && accuracy >= 0.85 && count < 4 && settings.mode === "standard") { count += 1; adaptation = "adaptationProgress"; }

  const trainingIndexes = count === 2 ? [1, 4] : count === 3 ? [0, 2, 5] : [0, 1, 3, 5];
  const titles: Record<Goal, "goalFitness" | "goalFlexibility" | "goalStrength" | "goalMobility"> = { fitness: "goalFitness", flexibility: "goalFlexibility", strength: "goalStrength", mobility: "goalMobility" };
  const focusKey = settings.goal === "fitness" ? "focusFitness" : settings.goal === "strength" ? "focusStrength" : settings.goal === "flexibility" ? "focusFlexibility" : "focusMobility";
  const exerciseNames = routineExercises(settings).map(exerciseName);

  const adaptationRoot = $("routine-adaptation");
  adaptationRoot.replaceChildren();
  const note = document.createElement("p"); note.textContent = t(adaptation);
  const adherence = document.createElement("small"); adherence.textContent = t("routineAdherence", { active: activeDays, planned: sessionCount(settings) });
  adaptationRoot.append(note, adherence);

  const schedule = $("routine-schedule"); schedule.replaceChildren();
  const title = document.createElement("h3"); title.textContent = t("weeklyPlan"); schedule.append(title);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  for (let index = 0; index < 7; index++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    const day = document.createElement("article"); day.className = trainingIndexes.includes(index) ? "routine-day is-training" : "routine-day";
    const dayLabel = document.createElement("b"); dayLabel.textContent = date.toLocaleDateString(getLocale() === "ar" ? "ar-EG" : "en-US", { weekday: "short" });
    const activity = document.createElement("span");
    activity.textContent = trainingIndexes.includes(index)
      ? `${t("trainingDay")} · ${t(titles[settings.goal])}`
      : t("restDay");
    day.append(dayLabel, activity);
    if (trainingIndexes.includes(index)) {
      const detail = document.createElement("small");
      detail.textContent = `${exerciseNames[index % exerciseNames.length]} · ${t("durationMinutes", { minutes: settings.mode === "standard" ? settings.minutes : Math.min(15, settings.minutes) })}`;
      day.append(detail);
      const focus = document.createElement("small"); focus.textContent = t(focusKey); day.append(focus);
    }
    schedule.append(day);
  }
}
function initRoutine(): void {
  const controls = ["routine-goal", "routine-level", "routine-minutes", "routine-mode", "routine-barrier"];
  for (const id of controls) $(id).addEventListener("change", () => {
    const next: RoutineSettings = {
      goal: ($("routine-goal") as HTMLSelectElement).value as Goal,
      level: ($("routine-level") as HTMLSelectElement).value as Level,
      minutes: Number(($("routine-minutes") as HTMLSelectElement).value) as RoutineSettings["minutes"],
      mode: ($("routine-mode") as HTMLSelectElement).value as Mode,
      barrier: ($("routine-barrier") as HTMLSelectElement).value as Barrier,
    };
    saveSettings(next);
  });
  $("btn-generate-routine").addEventListener("click", renderSchedule);
  window.addEventListener("healthmate:locale", renderSchedule);
  window.addEventListener("healthmate:refresh", renderSchedule);
  window.addEventListener("healthmate:routine-updated", renderSchedule);
  renderSchedule();
}

export { initRoutine };
