import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bearerToken, consumeDailyQuota, dayKey, parseAllowedOrigins, pickAllowedOrigin, sanitizeSummary, verifySupabaseUser } from "../worker/src/guard.ts";
import type { KvLike } from "../worker/src/guard.ts";
import worker from "../worker/src/index.ts";

const memoryKv = (): KvLike & { store: Map<string, string> } => {
  const store = new Map<string, string>();
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
};

test("ALLOWED_ORIGIN: لو مش متضبط أو علامة نجمة أو القيمة النموذجية = null (رفض)", () => {
  assert.equal(parseAllowedOrigins(undefined), null);
  assert.equal(parseAllowedOrigins(""), null);
  assert.equal(parseAllowedOrigins("*"), null);
  assert.equal(parseAllowedOrigins("https://YOUR-APP-DOMAIN.example"), null);
  assert.deepEqual(parseAllowedOrigins("https://a.com/, https://b.com"), ["https://a.com", "https://b.com"]);
  assert.equal(pickAllowedOrigin("https://evil.com", ["https://a.com"]), null);
  assert.equal(pickAllowedOrigin(null, ["https://a.com"]), null);
  assert.equal(pickAllowedOrigin("https://a.com", ["https://a.com"]), "https://a.com");
});

test("الحد اليومي: بيسمح لحد الحد وبعدين بيرفض، وبيتصفّر باليوم الجديد", async () => {
  const kv = memoryKv();
  const day1 = new Date("2026-11-19T10:00:00Z");
  for (let i = 1; i <= 3; i++) assert.deepEqual(await consumeDailyQuota(kv, "u1", 3, day1), { allowed: true, used: i });
  assert.equal((await consumeDailyQuota(kv, "u1", 3, day1)).allowed, false);
  assert.equal((await consumeDailyQuota(kv, "u2", 3, day1)).allowed, true); // مستخدم تاني مش متأثر
  assert.equal((await consumeDailyQuota(kv, "u1", 3, new Date("2026-11-20T00:01:00Z"))).allowed, true);
  assert.equal(dayKey(day1), "2026-11-19");
});

test("bearerToken", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken("Bearer a b"), null);
});

test("verifySupabaseUser: توكن صالح بيرجّع id، وغير صالح/خطأ شبكة بيرجّع null", async () => {
  const ok = (async () => Response.json({ id: "user-1" })) as unknown as typeof fetch;
  const bad = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  const boom = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  assert.equal(await verifySupabaseUser("t", "https://x.supabase.co/", "k", ok), "user-1");
  assert.equal(await verifySupabaseUser("t", "https://x.supabase.co", "k", bad), null);
  assert.equal(await verifySupabaseUser("t", "https://x.supabase.co", "k", boom), null);
});

test("الملخص: حقول معروفة وبنطاقات معقولة بس (الوزن مش بيتبعت أبدًا)", () => {
  assert.deepEqual(sanitizeSummary({ sleepHours: 7, mood: 4, weightKg: 80, name: "x", stress: 99, sessionsLast7Days: 3 }), { sleepHours: 7, mood: 4, sessionsLast7Days: 3 });
  assert.deepEqual(sanitizeSummary(null), {});
  assert.deepEqual(sanitizeSummary({ mood: "4" }), {});
});

// الـ handler كله
const baseEnv = { GEMINI_API_KEY: "test-key", GEMINI_MODELS: "gemini-test", ALLOWED_ORIGIN: "https://app.example", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", RATE_KV: memoryKv() };
const req = (init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request("https://worker.example/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), ...init, headers: { "Content-Type": "application/json", Origin: "https://app.example", "cf-connecting-ip": "192.0.2.1", ...init.headers } });

test("handler: بيرفض لو ALLOWED_ORIGIN مش متضبط (مش بيسمح لأي أصل)", async () => {
  const res = await worker.fetch(req(), { ...baseEnv, ALLOWED_ORIGIN: undefined });
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("handler: أصل غريب = 403، بدون توكن = 401", async () => {
  const evil = await worker.fetch(req({ headers: { Origin: "https://evil.example" } }), baseEnv);
  assert.equal(evil.status, 403);
  assert.notEqual(evil.headers.get("Access-Control-Allow-Origin"), "https://evil.example");
  const anon = await worker.fetch(req(), baseEnv);
  assert.equal(anon.status, 401);
});

test("handler: Gemini بيرجع النص والمصدر، والحد اليومي بيمنع اتصال المزوّد", async () => {
  const realFetch = globalThis.fetch;
  const calls: { url: string; body?: any }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
    return Response.json({ choices: [{ message: { role: "assistant", content: "أهلا" } }] });
  }) as typeof fetch;
  try {
    const env = { ...baseEnv, DAILY_LIMIT: "2", RATE_KV: memoryKv() };
    const auth = { Authorization: "Bearer tok.en" };
    const first = await worker.fetch(req({ headers: auth }), env);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { text: "أهلا", source: "ai" });
    const gemini = calls.find((c) => c.url.includes("generativelanguage.googleapis.com"))!;
    assert.equal(gemini.body.model, "gemini-test");
    assert.ok(!JSON.stringify(gemini.body.messages[0]).includes("summary")); // من غير موافقة مفيش ملخص
    assert.equal((await worker.fetch(req({ headers: auth }), env)).status, 200);
    const before = calls.length;
    const third = await worker.fetch(req({ headers: auth }), env);
    assert.equal(third.status, 429);
    assert.equal(calls.filter((c) => c.url.includes("generativelanguage.googleapis.com")).length, 2);
    assert.equal(calls.length, before + 1); // اتصال التحقق بس
  } finally { globalThis.fetch = realFetch; }
});

test("handler: بيرجع رد FAQ ثابت بالعربي عند غياب مفاتيح المزوّد", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ id: "user-1" })) as typeof fetch;
  try {
    const response = await worker.fetch(req({ body: JSON.stringify({ messages: [{ role: "user", content: "عايز اعرف الاشتراك" }] }), headers: { Authorization: "Bearer tok.en" } }), { ...baseEnv, GEMINI_API_KEY: undefined, GROQ_API_KEY: undefined, RATE_KV: memoryKv() });
    assert.equal(response.status, 200);
    const result = await response.json() as { text: string; source: string };
    assert.equal(result.source, "fallback");
    assert.match(result.text, /أسعار أو اشتراكات/);
  } finally { globalThis.fetch = realFetch; }
});

test("handler: يطبق حد IP الخاص بـ Cloudflare ويرفض 429 قبل استهلاك طلب خارجي", async () => {
  let checkedKey = "";
  const response = await worker.fetch(req(), {
    ...baseEnv,
    RATE_KV: memoryKv(),
    CHAT_RATE_LIMIT: { limit: async ({ key }) => { checkedKey = key; return { success: false }; } },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.match(checkedKey, /^[a-f0-9]{64}$/); // لا نحتفظ بعنوان IP الخام في مفتاح limiter
});

test("schema.sql: RLS على كل العمليات + حذف الحساب + تحكم بالنسخة", () => {
  const schema = readFileSync(resolve(import.meta.dirname, "../supabase/schema.sql"), "utf8");
  assert.match(schema, /enable row level security/i);
  assert.equal((schema.match(/create policy/gi) ?? []).length, 4);
  assert.equal((schema.match(/drop policy if exists/gi) ?? []).length, 4); // آمن لإعادة التشغيل
  assert.match(schema, /references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(schema, /add column if not exists version/i);
  assert.match(schema, /function public\.delete_my_account/i);
  assert.match(schema, /security definer/i);
  assert.match(schema, /set search_path = ''/i);
  assert.match(schema, /revoke all on function public\.delete_my_account\(\) from public, anon/i);
});
