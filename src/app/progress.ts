import { runCoach } from "../core/coach/rules.ts";
import { buildDaySummaries, summarizeWeek, toDateKey } from "../core/analytics.ts";
import type { WeekStats } from "../core/analytics.ts";
import { store } from "./storage.ts";
import { medicationSummary } from "./medications.ts";
import { getLocale, t } from "./i18n.ts";
import { exerciseName } from "./exercise-copy.ts";
import { exportCsv, printReport } from "./report.ts";
import { $, showToast } from "./ui.ts";
import { BADGE_ORDER, activeDays, bestStreak, currentStreak, earnedBadges, weekProgress } from "../core/streaks.ts";
import type { BadgeId } from "../core/streaks.ts";

let stressVal: number | undefined;
let moodVal: number | undefined;
let sleepQualityVal: number | undefined;
type ProgressActions = {
  backToPicker: () => void;
  startSession: () => Promise<void>;
  endSession: (showSummary: boolean) => void;
  activate: (session: any) => void;
  getSession: () => any;
};
let actions: ProgressActions;

function weekData() {
  const all = buildDaySummaries(store.getSessions(), store.getCheckins(), medicationSummary(), new Date(), 14);
  return { prev: all.slice(0, 7), cur: all.slice(7) };
}

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function loadCheckinForm(): void {
  const checkin = store.getCheckins()[toDateKey(new Date())] ?? {};
  $<HTMLInputElement>("in-sleep").value = checkin.sleepHours === undefined ? "" : String(checkin.sleepHours);
  $<HTMLInputElement>("in-weight").value = checkin.weightKg === undefined ? "" : String(checkin.weightKg);
  stressVal = checkin.stress;
  moodVal = checkin.mood;
  sleepQualityVal = checkin.sleepQuality;
  pressSeg($("in-stress"), String(stressVal ?? ""));
  pressSeg($("in-mood"), String(moodVal ?? ""));
  pressSeg($("in-sleep-quality"), String(sleepQualityVal ?? ""));
}

function pressSeg(segment: HTMLElement, value: string): void {
  segment.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.v === value)));
}

function initProgress(nextActions: ProgressActions): void {
  actions = nextActions;
  $("in-stress").onclick = (event) => {
    const value = (event.target as HTMLElement).dataset.v;
    if (!value) return;
    stressVal = Number(value);
    pressSeg($("in-stress"), value);
  };
  $("in-mood").onclick = (event) => {
    const value = (event.target as HTMLElement).dataset.v;
    if (!value) return;
    moodVal = Number(value);
    pressSeg($("in-mood"), value);
  };
  $("in-sleep-quality").onclick = (event) => {
    const value = (event.target as HTMLElement).dataset.v;
    if (!value) return;
    sleepQualityVal = Number(value);
    pressSeg($("in-sleep-quality"), value);
  };
  $("btn-save-checkin").onclick = () => {
    const rawSleep = $<HTMLInputElement>("in-sleep").value;
    const parsedSleep = rawSleep === "" ? undefined : Number(rawSleep);
    const sleepHours = parsedSleep === undefined || !Number.isFinite(parsedSleep) ? undefined : Math.min(16, Math.max(0, parsedSleep));
    const rawWeight = $<HTMLInputElement>("in-weight").value;
    const parsedWeight = rawWeight === "" ? undefined : Number(rawWeight);
    const weightKg = parsedWeight === undefined || !Number.isFinite(parsedWeight) ? undefined : Math.min(350, Math.max(20, parsedWeight));
    store.saveCheckin(toDateKey(new Date()), { sleepHours, sleepQuality: sleepQualityVal, weightKg, stress: stressVal, mood: moodVal });
    renderProgress();
    const button = $("btn-save-checkin");
    button.textContent = t("saved");
    window.dispatchEvent(new Event("healthmate:refresh"));
    setTimeout(() => (button.textContent = t("save")), 1500);
  };
  $("btn-share").onclick = shareReport;
  $("btn-export-csv").onclick = exportCsv;
  $("btn-print-report").onclick = printReport;
  $<HTMLSelectElement>("weekly-goal").onchange = (event) => {
    store.saveSettings({ ...store.getSettings(), weeklyGoal: Number((event.target as HTMLSelectElement).value) });
    renderStreaks();
  };
  $("btn-back").onclick = actions.backToPicker;
  $("btn-start").onclick = () => void actions.startSession();
  $("btn-end").onclick = () => actions.endSession(true);
  $("btn-skip-setup").onclick = () => {
    const session = actions.getSession();
    if (session?.phase === "setup") actions.activate(session);
  };
  $("btn-done").onclick = () => {
    $("summary").hidden = true;
    actions.backToPicker();
  };
}

function renderProgress(): void {
  loadCheckinForm();
  const { cur } = weekData();

  // اقتراحات المدرب
  const box = $("suggestions");
  box.innerHTML = "";
  const sugs = runCoach({ days: cur });
  if (sugs.length === 0) {
    const p = document.createElement("p");
    p.textContent = store.getSessions().length ? t("coachContinue") : t("coachStartLog");
    box.appendChild(p);
  }
  for (const s of sugs) {
    const d = document.createElement("div");
    d.className = "coach-suggestion";
    const title = document.createElement("b");
    const reason = document.createElement("span");
    const [localizedTitle, localizedReason] = localizeSuggestion(s.id, cur);
    title.textContent = localizedTitle;
    reason.textContent = localizedReason;
    d.append(title, reason);
    box.appendChild(d);
  }

  renderStreaks();
  renderHistory();
  window.dispatchEvent(new Event("healthmate:refresh"));
}

const BADGE_KEYS: Record<BadgeId, Parameters<typeof t>[0]> = {
  first_session: "badgeFirstSession", streak_3: "badgeStreak3", streak_7: "badgeStreak7",
  streak_30: "badgeStreak30", weekly_goal: "badgeWeeklyGoal", reps_100: "badgeReps100",
};

function renderStreaks(): void {
  const sessions = store.getSessions();
  const goal = store.getSettings().weeklyGoal;
  const days = activeDays(sessions);
  const now = new Date();
  const week = weekProgress(days, now, goal);
  $<HTMLSelectElement>("weekly-goal").value = String(week.goal);

  const stats = $("streak-stats");
  stats.replaceChildren();
  const line = (strong: string, label: string) => {
    const item = document.createElement("div"); item.className = "streak-stat";
    const value = document.createElement("strong"); value.textContent = strong;
    const caption = document.createElement("small"); caption.textContent = label;
    item.append(value, caption); stats.append(item);
  };
  line(String(currentStreak(days, now)), t("streakCurrent"));
  line(String(bestStreak(days)), t("streakBest"));
  line(`${week.done}/${week.goal}`, week.reached ? t("weeklyGoalReached") : t("weeklyGoalProgress"));

  const earned = new Set(earnedBadges(sessions, goal));
  const badges = $("badges");
  badges.replaceChildren();
  for (const id of BADGE_ORDER) {
    const badge = document.createElement("li");
    const got = earned.has(id);
    badge.className = got ? "badge is-earned" : "badge";
    badge.textContent = t(BADGE_KEYS[id]);
    if (!got) badge.setAttribute("aria-label", `${t(BADGE_KEYS[id])} — ${t("badgeLocked")}`);
    badges.append(badge);
  }
}

function renderHistory(): void {
  const root = $("session-history");
  root.replaceChildren();
  const rows = store.getSessions().sort((a, b) => b.at - a.at).slice(0, 10);
  if (!rows.length) { root.textContent = t("historyEmpty"); return; }
  const locale = getLocale() === "ar" ? "ar-EG" : "en-US";
  for (const row of rows) {
    const item = document.createElement("div"); item.className = "history-row";
    const text = document.createElement("div");
    const when = new Date(row.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
    const title = document.createElement("b"); title.textContent = `${exerciseName(row.exerciseId)} · ${when}`;
    const detail = document.createElement("small");
    detail.textContent = row.holdSeconds > 0 && row.goodReps + row.badReps === 0 ? t("historyHold", { seconds: row.holdSeconds }) : t("historyReps", { good: row.goodReps, bad: row.badReps });
    if (row.pain) detail.textContent += ` · ⚠ ${t("painFlag")}`;
    text.append(title, detail);
    // حذف بخطوتين: الضغطة الأولى بتطلب تأكيد
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn danger"; remove.textContent = t("delete");
    let armed = 0;
    remove.onclick = () => {
      if (!armed) {
        remove.textContent = t("confirmDelete");
        armed = window.setTimeout(() => { armed = 0; remove.textContent = t("delete"); }, 4000);
        return;
      }
      window.clearTimeout(armed);
      store.deleteSession(row.id);
      renderProgress();
    };
    item.append(text, remove);
    root.append(item);
  }
}

function localizeSuggestion(id: string, days: ReturnType<typeof weekData>["cur"]): [string, string] {
  if (id === "low_sleep_or_stress") {
    const today = days.at(-1);
    const reasons: string[] = [];
    if (today?.sleepHours !== undefined && today.sleepHours < 6) reasons.push(t("reasonSleep", { hours: today.sleepHours }));
    if (today?.sleepQuality !== undefined && today.sleepQuality <= 2) reasons.push(t("reasonSleepQuality", { quality: today.sleepQuality }));
    if (today?.stress !== undefined && today.stress >= 4) reasons.push(t("reasonStress", { stress: today.stress }));
    return [t("coachRest"), reasons.join(" ")];
  }
  if (id === "idle_days") return [t("coachShort"), t("reasonIdle", { days: 3 })];
  if (id.startsWith("high_error_rate")) {
    const sessions = days.flatMap((day) => day.sessions).filter((session) => session.exerciseId === id.split(":")[1]);
    const good = sessions.reduce((sum, session) => sum + session.goodReps, 0);
    const bad = sessions.reduce((sum, session) => sum + session.badReps, 0);
    return [t("coachForm"), t("reasonForm", { rate: Math.round((bad / Math.max(1, good + bad)) * 100) })];
  }
  if (id === "low_meds_adherence") {
    const taken = days.reduce((sum, day) => sum + day.medsTaken, 0);
    const total = days.reduce((sum, day) => sum + day.medsTotal, 0);
    return [t("coachMeds"), t("reasonMeds", { rate: Math.round((taken / Math.max(1, total)) * 100) })];
  }
  const values = days.flatMap((day) => day.sessions).map((session) => `${Math.round((session.goodReps / Math.max(1, session.goodReps + session.badReps)) * 100)}%`).slice(-3).join(" → ");
  return [t("coachImprove"), t("reasonImprovement", { values })];
}

async function shareReport(): Promise<void> {
  const { cur, prev } = weekData();
  const a: WeekStats = summarizeWeek(cur), b = summarizeWeek(prev);
  const lines = [
    t("weeklyReport"),
    t("reportSessions", { current: a.sessions, previous: b.sessions }),
    t("reportAccuracy", { current: pct(a.accuracy), previous: pct(b.accuracy) }),
    t("reportActiveDays", { days: a.activeDays }),
    a.avgSleep === null ? t("reportSleep", { hours: "—" }) : t("reportSleep", { hours: a.avgSleep.toFixed(1) }),
    "",
    t("reportDisclaimer"),
  ].join("\n");
  try {
    if (navigator.share) await navigator.share({ title: t("weeklyReport"), text: lines });
    else {
      await navigator.clipboard.writeText(lines);
      showToast(t("reportCopied"));
    }
  } catch {
    /* المستخدم لغى المشاركة */
  }
}

export { initProgress, renderProgress };
window.addEventListener("healthmate:locale", () => { if (!$<HTMLElement>("tab-progress").hidden) renderProgress(); });
