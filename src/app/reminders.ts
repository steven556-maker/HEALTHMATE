import { isLowStock, daysLeft, pendingReminders } from "../core/medications.ts";
import { dateKey } from "../core/medications.ts";
import { t } from "./i18n.ts";
import { readMedications } from "./med-store.ts";
import { showToast } from "./ui.ts";

// تذكيرات الأدوية. بتشتغل طول ما التطبيق مفتوح (حتى لو التبويب في الخلفية أو التطبيق مثبّت)،
// مش بس والتبويب بتاع الأدوية ظاهر. الإشعار بيتعرض عن طريق الـ service worker (الوحيد المدعوم على أندرويد).
// والتذكير والتطبيق مقفول تمامًا بيتم عن طريق Web Push (push.ts + الـ Worker cron + notify-sw.js).

const KEY = "hm.med.notified";
interface Ledger { date: string; counts: Record<string, number> }

function readLedger(today: string): Ledger {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Ledger | null;
    if (value && value.date === today && value.counts && typeof value.counts === "object") return value;
  } catch { /* دفتر تالف: نبدأ من جديد */ }
  return { date: today, counts: {} };
}
function writeLedger(ledger: Ledger): void {
  try { localStorage.setItem(KEY, JSON.stringify(ledger)); } catch { /* مش حرج */ }
}

export function reminderState(): "unsupported" | NotificationPermission {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export async function enableReminders(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

async function notify(title: string, body: string, tag: string): Promise<boolean> {
  if (reminderState() !== "granted") return false;
  const options: NotificationOptions = { body, tag, icon: "icon.svg", lang: document.documentElement.lang, dir: document.documentElement.dir as NotificationDirection, data: { tab: "medications" } };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) { await registration.showNotification(title, options); return true; }
  } catch { /* نجرّب Notification العادي */ }
  try { new Notification(title, options); return true; } catch { return false; }
}

/** بتتنده كل 30 ثانية وعند رجوع التبويب. آمنة للتكرار: كل جرعة ليها عدّاد تنبيهات محفوظ. */
export async function checkReminders(now = new Date()): Promise<void> {
  const meds = readMedications();
  if (!meds.length) return;
  const ledger = readLedger(dateKey(now));
  let changed = false;

  for (const due of pendingReminders(meds, now, ledger.counts)) {
    const body = `${due.med.name} · ${due.time} · ${t("checkPrescription")}`;
    const shown = await notify(t("medNotification"), body, `dose-${due.med.id}-${due.key}`);
    if (!shown && !document.hidden) showToast(`${t("medNotification")}: ${body}`, 8000);
    if (shown || !document.hidden) { ledger.counts[`${due.med.id}|${due.key}`] = due.attempt; changed = true; }
  }

  // تنبيه المخزون قبل ما يخلص بأيام، مرة في اليوم لكل دواء
  for (const med of meds) {
    const key = `stock|${med.id}`;
    if (!isLowStock(med) || ledger.counts[key]) continue;
    const body = `${med.name} · ${t("daysLeftShort", { days: Math.floor(daysLeft(med)) })}`;
    const shown = await notify(t("lowStockNotice"), body, `stock-${med.id}`);
    if (!shown && !document.hidden) showToast(`${t("lowStockNotice")}: ${body}`, 8000);
    if (shown || !document.hidden) { ledger.counts[key] = 1; changed = true; }
  }
  if (changed) writeLedger(ledger);
}

export function initReminders(): void {
  void checkReminders();
  window.setInterval(() => void checkReminders(), 30_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkReminders(); });
}
