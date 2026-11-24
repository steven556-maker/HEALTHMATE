// Web Push بدون حمولة (payload): السيرفر بيبعت "نبضة" فاضية موقّعة بـ VAPID، والـ service worker
// هو اللي بيبني نص الإشعار من بيانات محفوظة على الجهاز. كده أسماء الأدوية مبتوصلش السيرفر أبدًا،
// ومفيش حاجة نشفّرها (RFC 8291). السيرفر بيخزّن بس: اشتراك المتصفح + مواعيد (HH:MM) + المنطقة الزمنية.

export interface PushKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface PushRecord {
  endpoint: string;
  times: string[];
  tz: string;
  /** مفاتيح "تاريخ|وقت" لآخر نبضات اتبعتت (عشان ما نكرّرش) */
  sent: string[];
}

export const MAX_SUBS_PER_USER = 5;
export const MAX_TIMES = 24;
export const RECORD_TTL_SECONDS = 60 * 60 * 24 * 40; // بيتجدد مع كل مزامنة من التطبيق

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

/** منع SSRF: بنقبل بس خدمات الـ push المعروفة على https */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function sanitizeTimes(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_TIMES) return null;
  if (!input.every((time) => typeof time === "string" && TIME_RE.test(time))) return null;
  return [...new Set(input as string[])].sort();
}

export async function recordKey(userId: string, endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `push:${userId}:${hex}`;
}

/** التاريخ والوقت المحلي (HH:MM) في منطقة زمنية معيّنة */
export function localParts(now: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * المواعيد اللي حان وقتها ولسه ما اتبعتش ليها نبضة. الـ cron ممكن يتأخر أو يشتغل كل كام دقيقة،
 * فبنقبل موعد عدّى عليه من 0 لـ windowMin دقيقة. (موعد قبل منتصف الليل مش بيتعبّر لليوم اللي بعده: حالة نادرة ومقبولة.)
 */
export function dueSlots(record: Pick<PushRecord, "times" | "tz" | "sent">, now: Date, windowMin = 5): string[] {
  const { date, time } = localParts(now, record.tz);
  const current = minutesOf(time);
  return record.times
    .filter((slot) => { const diff = current - minutesOf(slot); return diff >= 0 && diff < windowMin; })
    .map((slot) => `${date}|${slot}`)
    .filter((key) => !record.sent.includes(key));
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = ""; for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const textB64url = (text: string) => b64url(new TextEncoder().encode(text));

/** رأس Authorization بتاع VAPID (RFC 8292): JWT بـ ES256 */
export async function vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateJwk: string, now = new Date()): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", JSON.parse(privateJwk) as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = textB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = textB64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: subject }));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`;
}

export type SendResult = "sent" | "gone" | "failed";

export async function sendPulse(endpoint: string, authorization: string, fetcher: typeof fetch = fetch): Promise<SendResult> {
  try {
    const response = await fetcher(endpoint, { method: "POST", headers: { Authorization: authorization, TTL: "3600", Urgency: "high", "Content-Length": "0" } });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch { return "failed"; }
}

/** شغل الـ cron: بيعدّي على الاشتراكات ويبعت نبضة لأي اشتراك حان موعده */
export async function runDuePushes(kv: PushKv, env: { vapidPublic: string; vapidPrivateJwk: string; subject: string; windowMin?: number; maxSends?: number }, now = new Date(), fetcher: typeof fetch = fetch): Promise<{ sent: number; removed: number }> {
  let sent = 0, removed = 0, cursor: string | undefined;
  const maxSends = env.maxSends ?? 40; // حد الـ subrequests في تنفيذ واحد
  do {
    const page = await kv.list({ prefix: "push:", cursor, limit: 200 });
    for (const { name } of page.keys) {
      if (sent >= maxSends) return { sent, removed };
      const raw = await kv.get(name);
      if (!raw) continue;
      let record: PushRecord;
      try { record = JSON.parse(raw) as PushRecord; } catch { await kv.delete(name); continue; }
      if (!isAllowedPushEndpoint(record.endpoint) || !isValidTimeZone(record.tz) || !Array.isArray(record.times)) { await kv.delete(name); continue; }
      const due = dueSlots({ ...record, sent: record.sent ?? [] }, now, env.windowMin);
      if (!due.length) continue;
      const result = await sendPulse(record.endpoint, await vapidAuthorization(record.endpoint, env.subject, env.vapidPublic, env.vapidPrivateJwk, now), fetcher);
      if (result === "gone") { await kv.delete(name); removed++; continue; }
      if (result === "sent") {
        sent++;
        const next: PushRecord = { ...record, sent: [...(record.sent ?? []), ...due].slice(-12) };
        await kv.put(name, JSON.stringify(next), { expirationTtl: RECORD_TTL_SECONDS });
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { sent, removed };
}
