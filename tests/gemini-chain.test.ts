import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import worker from "../worker/src/index.ts";
import { Cooldowns, DEFAULT_GEMINI_MODELS, FREE_GEMINI_MODELS, cooldownFor, parseModels, retryInMs } from "../worker/src/models.ts";
import type { KvLike } from "../worker/src/guard.ts";

const memoryKv = (): KvLike => { const store = new Map<string, string>(); return { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } }; };
const env = (models: string, extra: Record<string, unknown> = {}) => ({ GEMINI_API_KEY: "k", GEMINI_MODELS: models, ALLOWED_ORIGIN: "https://app.example", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", RATE_KV: memoryKv(), ...extra });
const chat = (content = "hi") => new Request("https://w.example/api/chat", { method: "POST", body: JSON.stringify({ locale: "en", messages: [{ role: "user", content }] }), headers: { "Content-Type": "application/json", Origin: "https://app.example", Authorization: "Bearer tok.en", "cf-connecting-ip": "192.0.2.9" } });

type Script = Record<string, Array<number | string>>; // لكل موديل: قائمة نتائج (رقم = status خطأ، نص = رد ناجح)
function mockProviders(script: Script) {
  const realFetch = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
    const body = JSON.parse(String(init?.body)); calls.push(body.model);
    const step = script[body.model]?.shift() ?? 404;
    if (typeof step === "number") return new Response(JSON.stringify({ error: { message: step === 429 ? "Quota exceeded. Please retry in 40s" : "boom" } }), { status: step, headers: { "Content-Type": "application/json" } });
    return Response.json({ choices: [{ message: { role: "assistant", content: step } }] });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

test("القائمة الافتراضية: كل موديلات Gemini المجانية، وwrangler.toml مطابق لها بالظبط", () => {
  assert.ok(FREE_GEMINI_MODELS.length >= 10 && new Set(FREE_GEMINI_MODELS).size === FREE_GEMINI_MODELS.length);
  const toml = readFileSync(resolve(import.meta.dirname, "../worker/wrangler.toml"), "utf8");
  assert.equal(/^GEMINI_MODELS = "([^"]+)"/m.exec(toml)?.[1], DEFAULT_GEMINI_MODELS);
  assert.deepEqual(parseModels(" a, b ,a,, "), ["a", "b"]);
  assert.deepEqual(parseModels(undefined), FREE_GEMINI_MODELS);
});

test("cooldown: 429 بيتعلّم منه (retry in / يومي / دقيقة)، و404 و5xx ليهم مدد مناسبة", () => {
  assert.equal(retryInMs("Please retry in 12.5s"), 12500);
  assert.equal(cooldownFor({ status: 429, message: "x", retryAfterMs: 20_000 }), 20_000);
  assert.equal(cooldownFor({ status: 429, message: "Please retry in 70236s" }), 30 * 60_000); // سقف 30 دقيقة
  assert.equal(cooldownFor({ status: 429, message: "GenerateRequestsPerDayPerProjectPerModel" }), 30 * 60_000);
  assert.equal(cooldownFor({ status: 429, message: "rate" }), 60_000);
  assert.equal(cooldownFor({ status: 404, message: "no model" }), 5 * 60_000);
  assert.equal(cooldownFor({ status: 503, message: "x" }), 15_000);
  const c = new Cooldowns(); c.mark("m", 1000, 0);
  assert.equal(c.isCold("m", 999), true); assert.equal(c.isCold("m", 1000), false);
});

test("بيجرّب كل الموديلات بالترتيب فورًا (429/404 من غير انتظار) لحد ما واحد يرد", async () => {
  const p = mockProviders({ "t1-a": [429], "t1-b": [404], "t1-c": [429], "t1-d": ["أهلا من الرابع"] });
  try {
    const started = Date.now();
    const res = await worker.fetch(chat(), env("t1-a,t1-b,t1-c,t1-d"));
    assert.deepEqual(await res.json(), { text: "أهلا من الرابع", source: "ai" });
    assert.deepEqual(p.calls, ["t1-a", "t1-b", "t1-c", "t1-d"]); // مفيش إعادة على 429/404
    assert.ok(Date.now() - started < 1000, "الانتقال بين الموديلات لازم يتم في أقل من ثانية");
  } finally { p.restore(); }
});

test("الموديلات المستنفدة بتتخطّى في الطلبات التالية من غير أي اتصال", async () => {
  const p = mockProviders({ "t2-a": [429], "t2-b": ["رد1", "رد2"] });
  try {
    const e = env("t2-a,t2-b", { DAILY_LIMIT: "10" });
    await worker.fetch(chat(), e);
    const second = await worker.fetch(chat(), e);
    assert.equal((await second.json() as { text: string }).text, "رد2");
    assert.deepEqual(p.calls, ["t2-a", "t2-b", "t2-b"]); // t2-a اتجرّب مرة واحدة بس
  } finally { p.restore(); }
});

test("خطأ خادم مؤقت (503): إعادة واحدة سريعة على نفس الموديل بدل ما نخسره", async () => {
  const p = mockProviders({ "t3-a": [503, "نجح بعد إعادة"] });
  try {
    const res = await worker.fetch(chat(), env("t3-a,t3-b"));
    assert.equal((await res.json() as { text: string }).text, "نجح بعد إعادة");
    assert.deepEqual(p.calls, ["t3-a", "t3-a"]);
  } finally { p.restore(); }
});

test("لو كل الموديلات خلصت: رد ثابت 200 (مش فشل) بسبب provider_quota، وطلب الأعراض الخطيرة بيتوجّه للطوارئ", async () => {
  const p = mockProviders({ "t4-a": [429, 429], "t4-b": [429, 429] });
  try {
    const e = env("t4-a,t4-b", { DAILY_LIMIT: "10" });
    const res = await worker.fetch(chat("what can this app do?"), e);
    assert.equal(res.status, 200);
    const body = await res.json() as { text: string; source: string; reason: string };
    assert.equal(body.source, "fallback"); assert.equal(body.reason, "provider_quota"); assert.match(body.text, /HEALTHMATE/);
    const before = p.calls.length;
    const urgent = await (await worker.fetch(chat("I have chest pain"), e)).json() as { text: string; source: string };
    assert.equal(urgent.source, "fallback"); assert.match(urgent.text, /urgent medical help/);
    assert.equal(p.calls.length, before, "كلهم في cooldown: مفيش اتصال خارجي تاني");
  } finally { p.restore(); }
});

test("حتى لو كود المزوّد نفسه اتعطّل (شبكة واقعة أو استثناء قبل الحلقة): الرد ثابت 200 مش 503", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => { if (String(url).includes("/auth/v1/user")) return Response.json({ id: "user-1" }); throw new TypeError("network down"); }) as typeof fetch;
  try {
    const network = await worker.fetch(chat(), env("t5-a"));
    assert.equal(network.status, 200);
    assert.equal((await network.json() as { source: string }).source, "fallback");
    const broken = env("t5-b");
    Object.defineProperty(broken, "GEMINI_MODELS", { get() { throw new Error("unexpected crash before the model loop"); } });
    const crashed = await worker.fetch(chat(), broken);
    assert.equal(crashed.status, 200);
    assert.equal((await crashed.json() as { source: string }).source, "fallback");
  } finally { globalThis.fetch = realFetch; }
});

test("فشل خادم مؤقت على كل الموديلات: جولة تانية بعد وقفة قصيرة بترجع للموديلات دي (من غير 429/404)", async () => {
  const p = mockProviders({ "r-a": [500, 500, "نجح في الجولة التانية"], "r-b": [429] });
  try {
    const res = await worker.fetch(chat(), env("r-a,r-b"));
    assert.deepEqual(await res.json(), { text: "نجح في الجولة التانية", source: "ai" });
    assert.deepEqual(p.calls, ["r-a", "r-a", "r-b", "r-a"]); // r-b حصته خلصت فمفيش رجوع ليه
  } finally { p.restore(); }
});

test("كل الجولات فشلت بخطأ مؤقت: رد ثابت 200 بعد 3 جولات كحد أقصى", async () => {
  const p = mockProviders({ "q-a": [500, 500, 500, 500, 500, 500] });
  try {
    const res = await worker.fetch(chat("hello"), env("q-a"));
    const body = await res.json() as { source: string; reason: string };
    assert.equal(res.status, 200); assert.equal(body.source, "fallback"); assert.equal(body.reason, "provider_error");
    assert.equal(p.calls.length, 6); // 3 جولات × (محاولة + إعادة واحدة)
  } finally { p.restore(); }
});
