// كارت الملخص الأسبوعي: من جلسات الجهاز بس. مفيش أرقام تجريبية: لو مفيش جلسات بيظهر نص فاضي.
import { getLocale } from "./i18n.ts";
import { store } from "./storage.ts";

const DAY = 86400000;
const S = {
  title: ["ملخص أسبوعك", "Your week"],
  sessions: ["جلسات", "sessions"],
  days: ["أيام نشاط", "active days"],
  reps: ["تكرار صحيح", "good reps"],
  empty: ["لسه مفيش جلسات الأسبوع ده. ابدأ تمرين وهيظهر ملخصك هنا.", "No sessions this week yet. Do a workout and your summary shows here."],
  more: ["أكتر من الأسبوع اللي فات بـ", "more than last week by"],
  less: ["أقل من الأسبوع اللي فات بـ", "fewer than last week by"],
  same: ["نفس عدد جلسات الأسبوع اللي فات", "same number of sessions as last week"],
  note: ["الأرقام من جلساتك المسجلة على الجهاز.", "Numbers come from sessions saved on this device."],
} as const;
const tx = (k: keyof typeof S): string => S[k][getLocale() === "en" ? 1 : 0];

export function renderWeeklyCard(): void {
  let card = document.getElementById("weekly-card");
  if (!card) {
    const anchor = document.getElementById("streak-panel");
    if (!anchor) return;
    card = document.createElement("section");
    card.id = "weekly-card"; card.className = "panel weekly-card";
    anchor.before(card);
  }
  const now = Date.now();
  const all = store.getSessions();
  const cur = all.filter((s) => now - s.at < 7 * DAY);
  const prev = all.filter((s) => now - s.at >= 7 * DAY && now - s.at < 14 * DAY);
  card.replaceChildren();
  const h = document.createElement("h2"); h.textContent = tx("title"); card.append(h);
  if (cur.length === 0) {
    const p = document.createElement("p"); p.className = "hint"; p.textContent = tx("empty"); card.append(p);
    return;
  }
  const dayCount = new Set(cur.map((s) => new Date(s.at).toDateString())).size;
  const reps = cur.reduce((n, s) => n + (s.goodReps || 0), 0);
  const grid = document.createElement("div"); grid.className = "weekly-grid";
  for (const [val, label] of [[cur.length, tx("sessions")], [dayCount, tx("days")], [reps, tx("reps")]] as const) {
    const cell = document.createElement("div"); cell.className = "weekly-cell";
    const b = document.createElement("b"); b.textContent = String(val);
    const l = document.createElement("small"); l.textContent = label;
    cell.append(b, l); grid.append(cell);
  }
  card.append(grid);
  const diff = cur.length - prev.length;
  const cmp = document.createElement("p"); cmp.className = "hint";
  if (prev.length === 0) cmp.textContent = "";
  else cmp.textContent = diff === 0 ? tx("same") : `${diff > 0 ? tx("more") : tx("less")} ${Math.abs(diff)}`;
  const note = document.createElement("p"); note.className = "hint"; note.textContent = tx("note");
  card.append(...(cmp.textContent ? [cmp] : []), note);
}
