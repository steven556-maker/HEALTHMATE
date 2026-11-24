import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { dueSlots, isAllowedPushEndpoint, isValidTimeZone, localParts, recordKey, runDuePushes, sanitizeTimes, sendPulse, vapidAuthorization } from "../worker/src/push.ts";
import type { PushKv, PushRecord } from "../worker/src/push.ts";
import worker from "../worker/src/index.ts";

const memoryKv = (): PushKv & { store: Map<string, string> } => {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); },
    list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
};

test("endpoint: خدمات push المعروفة على https بس (منع SSRF)", () => {
  assert.ok(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"));
  assert.ok(isAllowedPushEndpoint("https://web.push.apple.com/x"));
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedPushEndpoint("https://evil.com/fcm.googleapis.com"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(isAllowedPushEndpoint("https://user@fcm.googleapis.com/x"), false);
  assert.equal(isAllowedPushEndpoint("https://169.254.169.254/"), false);
  assert.equal(isAllowedPushEndpoint(42), false);
});

test("المواعيد والمنطقة الزمنية بتتفحص", () => {
  assert.deepEqual(sanitizeTimes(["21:00", "09:00", "09:00"]), ["09:00", "21:00"]);
  assert.equal(sanitizeTimes(["9:00"]), null);
  assert.equal(sanitizeTimes("09:00"), null);
  assert.equal(sanitizeTimes(Array(25).fill("09:00")), null);
  assert.ok(isValidTimeZone("Africa/Cairo"));
  assert.equal(isValidTimeZone("Mars/Base"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("الوقت المحلي بيحترم المنطقة الزمنية", () => {
  const now = new Date("2026-11-21T07:03:00Z"); // القاهرة UTC+2 في نوفمبر
  assert.deepEqual(localParts(now, "Africa/Cairo"), { date: "2026-11-21", time: "09:03" });
  assert.deepEqual(localParts(now, "UTC"), { date: "2026-11-21", time: "07:03" });
});

test("dueSlots: جوه النافذة بس، ومن غير تكرار", () => {
  const record = { times: ["09:00", "21:00"], tz: "Africa/Cairo", sent: [] as string[] };
  assert.deepEqual(dueSlots(record, new Date("2026-11-21T07:00:00Z")), ["2026-11-21|09:00"]);
  assert.deepEqual(dueSlots(record, new Date("2026-11-21T07:04:00Z")), ["2026-11-21|09:00"]);
  assert.deepEqual(dueSlots(record, new Date("2026-11-21T07:05:00Z")), []);   // برا النافذة
  assert.deepEqual(dueSlots(record, new Date("2026-11-21T06:59:00Z")), []);   // لسه بدري
  assert.deepEqual(dueSlots({ ...record, sent: ["2026-11-21|09:00"] }, new Date("2026-11-21T07:01:00Z")), []);
  assert.deepEqual(dueSlots({ ...record, sent: ["2026-11-20|09:00"] }, new Date("2026-11-21T07:01:00Z")), ["2026-11-21|09:00"]); // اليوم اللي فات مش بيمنع النهارده
});

async function vapid() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]).toString("base64url");
  return { publicKey: raw, privateJwk: JSON.stringify(privateKey.export({ format: "jwk" })), pubKeyObject: publicKey };
}

test("VAPID: JWT بتوقيع ES256 صالح و aud صحيح", async () => {
  const keys = await vapid();
  const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", "mailto:a@b.co", keys.publicKey, keys.privateJwk, new Date("2026-11-21T07:00:00Z"));
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(match);
  const [, h, c, s, k] = match!;
  assert.equal(k, keys.publicKey);
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:a@b.co");
  assert.equal(claims.exp, Math.floor(new Date("2026-11-21T07:00:00Z").getTime() / 1000) + 12 * 3600);
  const { createVerify } = await import("node:crypto");
  const verify = createVerify("SHA256"); verify.update(`${h}.${c}`);
  assert.ok(verify.verify({ key: keys.pubKeyObject, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
});

test("cron: بيبعت نبضة مرة واحدة، ويشيل الاشتراك المنتهي (410)", async () => {
  const keys = await vapid();
  const kv = memoryKv();
  const mk = async (user: string, endpoint: string, extra: Partial<PushRecord> = {}) => {
    const record: PushRecord = { endpoint, times: ["09:00"], tz: "Africa/Cairo", sent: [], ...extra };
    kv.store.set(await recordKey(user, endpoint), JSON.stringify(record));
  };
  await mk("u1", "https://fcm.googleapis.com/fcm/send/ok");
  await mk("u2", "https://fcm.googleapis.com/fcm/send/gone");
  await mk("u3", "https://fcm.googleapis.com/fcm/send/other", { times: ["12:00"] });
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(null, { status: url.endsWith("/gone") ? 410 : 201 });
  }) as unknown as typeof fetch;
  const env = { vapidPublic: keys.publicKey, vapidPrivateJwk: keys.privateJwk, subject: "mailto:a@b.co" };
  const now = new Date("2026-11-21T07:01:00Z");
  assert.deepEqual(await runDuePushes(kv, env, now, fetcher), { sent: 1, removed: 1 });
  assert.equal(calls.length, 2);
  assert.match(calls[0].headers.Authorization, /^vapid t=/);
  assert.equal(kv.store.size, 2); // اتشال المنتهي بس
  assert.deepEqual(await runDuePushes(kv, env, new Date("2026-11-21T07:03:00Z"), fetcher), { sent: 0, removed: 0 }); // مفيش تكرار
});

test("sendPulse: أخطاء الشبكة بترجع failed", async () => {
  assert.equal(await sendPulse("https://fcm.googleapis.com/x", "a", (async () => { throw new Error("net"); }) as unknown as typeof fetch), "failed");
});

test("مسارات الـ Worker: لازم تسجيل دخول، وبتحفظ وتمسح الاشتراك", async () => {
  const kv = memoryKv();
  const env = { ANTHROPIC_API_KEY: "k", ALLOWED_ORIGIN: "https://app.test", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "a", RATE_KV: kv };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ id: "user-1" })) as typeof fetch;
  try {
    const call = (path: string, body: unknown, auth = "Bearer tok") => worker.fetch(new Request(`https://w.test${path}`, { method: "POST", headers: { Origin: "https://app.test", "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) }), env);
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    assert.equal((await call("/push/subscribe", { endpoint, times: ["09:00"], tz: "Africa/Cairo" }, "")).status, 401);
    assert.equal((await call("/push/subscribe", { endpoint: "https://evil.com/x", times: ["09:00"], tz: "UTC" })).status, 400);
    assert.equal((await call("/push/subscribe", { endpoint, times: ["bad"], tz: "UTC" })).status, 400);
    assert.equal((await call("/push/subscribe", { endpoint, times: ["09:00"], tz: "UTC" })).status, 200);
    assert.equal(kv.store.size, 1);
    const [stored] = [...kv.store.values()];
    assert.ok(!stored.includes("name")); // مفيش أسماء أدوية على السيرفر
    assert.equal((await call("/push/unsubscribe", { endpoint })).status, 200);
    assert.equal(kv.store.size, 0);
    for (let i = 0; i < 5; i++) assert.equal((await call("/push/subscribe", { endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, times: ["09:00"], tz: "UTC" })).status, 200);
    assert.equal((await call("/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/six", times: ["09:00"], tz: "UTC" })).status, 429);
  } finally { globalThis.fetch = realFetch; }
});
