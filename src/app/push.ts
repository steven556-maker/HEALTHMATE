import { hasSupabaseConfig, assistantUrl, pushPublicKey } from "./cloud-config.ts";
import { parseTimes } from "../core/medications.ts";
import { readMedications } from "./med-store.ts";
import { t } from "./i18n.ts";

// Web Push للتذكيرات والتطبيق مقفول. السيرفر (Worker) بيخزّن اشتراك المتصفح + المواعيد + المنطقة الزمنية بس.
// أسماء الأدوية بتفضل على الجهاز: بنكتب نص الإشعار في Cache محلي والـ service worker بيقراه وقت وصول النبضة.

const FLAG = "hm.push.enabled";
const META_CACHE = "hm-push-meta";
const META_URL = "push-meta.json";

export type PushState = "unsupported" | "blocked" | "off" | "on";

export function pushSupported(): boolean {
  return hasSupabaseConfig && !!assistantUrl && !!pushPublicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

const flagged = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
const setFlag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch { /* مش حرج */ } };

export function pushState(): PushState {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return flagged() && Notification.permission === "granted" ? "on" : "off";
}

function base(): string { return assistantUrl.replace(/\/$/, ""); }

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** كل المواعيد (HH:MM) لكل الأدوية الشغالة، من غير تكرار */
export function allDoseTimes(): string[] {
  const times = new Set<string>();
  for (const med of readMedications()) for (const time of parseTimes(med.times) ?? []) times.add(time);
  return [...times].sort();
}

/** نص الإشعار المحلي: أسماء الأدوية لكل موعد. بيتقرا من الـ service worker. */
async function writeMeta(): Promise<void> {
  try {
    const slots: Record<string, string[]> = {};
    for (const med of readMedications()) for (const time of parseTimes(med.times) ?? []) (slots[time] ??= []).push(med.name);
    const cache = await caches.open(META_CACHE);
    await cache.put(META_URL, new Response(JSON.stringify({ title: t("medNotification"), suffix: t("checkPrescription"), fallback: t("medNotificationGeneric"), slots, lang: document.documentElement.lang, dir: document.documentElement.dir })));
  } catch { /* Cache مش متاح: الـ SW هيعرض نص عام */ }
}

async function call(path: string, token: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(`${base()}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return response.ok;
  } catch { return false; }
}

async function token(): Promise<string | null> {
  const { getAccessToken } = await import("./cloud-sync.ts");
  return getAccessToken();
}

export type EnableResult = "ok" | "unsupported" | "sign_in" | "denied" | "failed";

export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  const accessToken = await token();
  if (!accessToken) return "sign_in";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription())
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushPublicKey) });
    await writeMeta();
    const ok = await call("/push/subscribe", accessToken, { endpoint: subscription.endpoint, times: allDoseTimes(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (!ok) return "failed";
    setFlag(true);
    return "ok";
  } catch { return "failed"; }
}

export async function disablePush(): Promise<void> {
  if (!flagged() && !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const accessToken = await token();
      if (accessToken) await call("/push/unsubscribe", accessToken, { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    await (await caches.open(META_CACHE)).delete(META_URL);
  } catch { /* مش حرج */ }
  setFlag(false);
}

let timer = 0;
/** بيجدّد المواعيد على السيرفر (وبيجدّد صلاحية الاشتراك) لما الأدوية تتغيّر أو التطبيق يتفتح */
export function syncPush(): void {
  if (pushState() !== "on") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    try {
      const accessToken = await token();
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      await writeMeta();
      if (accessToken && subscription) await call("/push/subscribe", accessToken, { endpoint: subscription.endpoint, times: allDoseTimes(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch { /* هنحاول المرة الجاية */ }
  }, 3000);
}

export function initPush(): void {
  syncPush();
  window.addEventListener("healthmate:refresh", syncPush);
  window.addEventListener("healthmate:locale", syncPush);
}
