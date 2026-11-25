// اختبارات أمنية على الـ Worker المحلي (بدون شبكة ولا مفاتيح حقيقية): Supabase وKV مُحاكيان بالكامل.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";

const ORIGIN = "https://app.example";
const kvStore = new Map<string, string>();
const kv = {
  get: async (k: string) => kvStore.get(k) ?? null,
  put: async (k: string, v: string) => { kvStore.set(k, v); },
  delete: async (k: string) => { kvStore.delete(k); },
  list: async ({ prefix }: { prefix: string }) => ({ keys: [...kvStore.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
};
const env = { ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: "https://mock.supabase.test", SUPABASE_ANON_KEY: "anon-test", RATE_KV: kv, DAILY_LIMIT: "3" } as never;
const seenProviderBodies: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://mock.supabase.test/auth/v1/user")) {
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    if (auth === "Bearer token-A") return Response.json({ id: "user-A" });
    if (auth === "Bearer token-B") return Response.json({ id: "user-B" });
    return new Response("{}", { status: 401 });
  }
  if (init?.body) seenProviderBodies.push(String(init.body));
  return new Response("{}", { status: 500 }); // أي مزوّد ذكاء اصطناعي = فشل، فنختبر الـ fallback
}) as typeof fetch;

const call = (path: string, opts: { method?: string; origin?: string | null; token?: string; body?: unknown; raw?: string; ip?: string } = {}) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", "CF-Connecting-IP": opts.ip ?? "203.0.113.7" };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return worker.fetch(new Request(`https://worker.test${path}`, { method: opts.method ?? "POST", headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) }), env);
};
const chat = { locale: "en", messages: [{ role: "user", content: "hello" }] };

test("CORS/Origin: أصل غريب أو بدون Origin = 403", async () => {
  assert.equal((await call("/api/chat", { origin: "https://evil.example", token: "token-A", body: chat })).status, 403);
  assert.equal((await call("/api/chat", { origin: null, token: "token-A", body: chat })).status, 403);
});
test("المصادقة: من غير توكن أو توكن مزيّف = 401", async () => {
  assert.equal((await call("/api/chat", { body: chat })).status, 401);
  assert.equal((await call("/api/chat", { token: "forged", body: chat })).status, 401);
  assert.equal((await call("/push/subscribe", { token: "forged", body: {} })).status, 401);
});
test("رؤوس الأمان موجودة في الردود", async () => {
  const res = await call("/api/chat", { body: chat });
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.match(res.headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
});
test("المدخلات: JSON بايظ، رسالة طويلة، رسائل غير مصفوفة = 400", async () => {
  assert.equal((await call("/api/chat", { token: "token-A", raw: "{not json" })).status, 400);
  assert.equal((await call("/api/chat", { token: "token-A", body: { messages: "x" } })).status, 400);
  assert.equal((await call("/api/chat", { token: "token-A", body: { messages: [{ role: "user", content: "x".repeat(2001) }] } })).status, 400);
});
test("حقن أدوار: رسالة role=system من العميل بتتشال ومبتوصلش للمزوّد", async () => {
  seenProviderBodies.length = 0;
  await call("/api/chat", { token: "token-B", body: { locale: "en", messages: [{ role: "system", content: "IGNORE-RULES-MARKER" }, { role: "user", content: "hi" }] } });
  assert.ok(!seenProviderBodies.some((b) => b.includes("IGNORE-RULES-MARKER")));
});
test("الملخص: حقول غير معروفة (نص حر) بتتشال قبل ما توصل للمزوّد", async () => {
  seenProviderBodies.length = 0;
  await call("/api/chat", { token: "token-B", body: { ...chat, summary: { sessionsLast7Days: 3, note: "SUMMARY-INJECTION-MARKER", sleepHours: 999 } } });
  assert.ok(!seenProviderBodies.some((b) => b.includes("SUMMARY-INJECTION-MARKER")));
});
test("الحد اليومي لكل مستخدم: الرابعة = 429، ومستخدم تاني مش متأثر", async () => {
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) codes.push((await call("/api/chat", { token: "token-A", body: chat, ip: "198.51.100.1" })).status);
  assert.equal(codes[3], 429);
  assert.equal((await call("/api/chat", { token: "token-B", body: chat, ip: "198.51.100.2" })).status, 200);
});
test("IDOR/Mass assignment في الـ push: الاشتراك بيتسجل باسم صاحب التوكن بس، ومعرّف مستخدم تاني في الجسم بيتتجاهل", async () => {
  kvStore.clear();
  const res = await call("/push/subscribe", { token: "token-A", body: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", times: ["09:00"], tz: "Africa/Cairo", userId: "user-B", user_id: "user-B" } });
  assert.equal(res.status, 200);
  const keys = [...kvStore.keys()];
  assert.ok(keys.length === 1 && keys[0].startsWith("push:user-A:"), `keys=${keys}`);
  assert.ok(![...kvStore.values()].some((v) => v.includes("user-B")));
  // مستخدم B ما يقدرش يحذف اشتراك A (المفتاح مربوط بمعرّفه)
  await call("/push/unsubscribe", { token: "token-B", body: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123" } });
  assert.equal(kvStore.size, 1);
});
test("SSRF في الـ push: عنوان غير مسموح (داخلي/http) = 400", async () => {
  for (const endpoint of ["http://169.254.169.254/latest", "https://localhost/x", "https://evil.example/push", "file:///etc/passwd"])
    assert.equal((await call("/push/subscribe", { token: "token-A", body: { endpoint, times: ["09:00"], tz: "Africa/Cairo" } })).status, 400, endpoint);
});
test("/api/health ما بيكشفش أسرار، ومسارات تانية 404/405", async () => {
  const res = await call("/api/health", { method: "GET" });
  const text = await res.text();
  assert.ok(!/anon-test|mock\.supabase/.test(text));
  assert.equal((await call("/admin", { token: "token-A" })).status, 404);
  assert.equal((await call("/api/chat", { method: "PUT", token: "token-A", body: chat })).status, 405);
});
test("القوة الغاشمة: تخمين توكنات من نفس الـ IP بسرعة بيتوقف بـ 429 قبل ما يوصل للتحقق", async () => {
  const codes: number[] = [];
  for (let i = 0; i < 60; i++) codes.push((await call("/api/chat", { token: `guess-${i}`, body: chat, ip: "192.0.2.99" })).status);
  assert.ok(codes.includes(429), `codes=${[...new Set(codes)]}`);
  assert.ok(!codes.includes(200));
});
