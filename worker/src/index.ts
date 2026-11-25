import OpenAI from "openai";
import { bearerToken, consumeDailyQuota, parseAllowedOrigins, pickAllowedOrigin, sanitizeSummary, verifySupabaseUser } from "./guard.ts";
import type { KvLike } from "./guard.ts";
import { MAX_SUBS_PER_USER, RECORD_TTL_SECONDS, isAllowedPushEndpoint, isValidTimeZone, recordKey, runDuePushes, sanitizeTimes } from "./push.ts";
import type { PushKv, PushRecord } from "./push.ts";
import { withRetry } from "./retry.js";
import { Cooldowns, cooldownFor, parseModels } from "./models.ts";
import type { ModelFailure } from "./models.ts";
import { staticReply } from "./fallback.js";
import { ALLOWED_IMAGE_MIME, FOOD_PROMPT, MAX_IMAGE_B64, parseFoodReply } from "./food.ts";

interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODELS?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  /** أصل أو أكتر مفصولين بفاصلة. لازم يتضبط، ولو مش متضبط الـ Worker بيرفض كل الطلبات. */
  ALLOWED_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  RATE_KV?: KvLike & Partial<PushKv>;
  CHAT_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
  PUSH_WINDOW_MIN?: string;
  DAILY_LIMIT?: string;
  FOOD_DAILY_LIMIT?: string;
}

/** موديلات استنفدت حصتها مؤخرًا. في ذاكرة الـ isolate (من غير كتابة على KV المحدود في الخطة المجانية). */
const cooldowns = new Cooldowns();
const SAFETY_AR = "لا تشخّص ولا تقترح جرعات أو تعديل أو إيقاف دواء. إذا ذكر المستخدم ألم صدر أو ضيق نفس أو دوخة شديدة، وجّهه لطلب مساعدة طبية عاجلة. التطبيق لا يستبدل الطبيب.";
const STYLE_AR = "رد بنفس لغة آخر رسالة من المستخدم. لو كتب بالعربي رد بالعامية المصرية البسيطة وباختصار. اكتب نص عادي بدون أي تنسيق Markdown (من غير نجوم أو # أو جداول)، واستخدم سطور قصيرة أو شرطة عادية للنقاط. لما يسأل عن أكل أو زيادة وزن أو تنشيف، اقترح أكلات مصرية متاحة (فول، طعمية، بيض، فراخ، لحمة، سمك، كشري، رز، مكرونة، عدس، جبنة قريش، زبادي، لبن، بطاطا، فاكهة، مكسرات) بكميات تقريبية، وقل إن ده إرشاد عام ومش بديل لأخصائي تغذية.";
const SYSTEM_AR = `أنت مساعد داخل تطبيق HEALTHMATE، مهمتك تقديم توعية صحية عامة ومساعدة المستخدم على التمارين والسجلات الصحية والتغذية العامة. ولو السؤال خارج نطاق التطبيق قل إنك مش متخصص فيه. ${SAFETY_AR} ${STYLE_AR}`;
const SYSTEM_EN = "You are an assistant in HEALTHMATE, a home exercise and health tracking app. Reply in the same language as the user's latest message (if it is Arabic, reply in simple Egyptian Arabic). Be brief. Use plain text only, no Markdown (no asterisks, headings or tables). For food or weight questions, suggest common Egyptian foods (foul, ta'ameya, eggs, chicken, fish, koshari, rice, lentils, white cheese, yogurt, milk, sweet potato, fruit, nuts) with rough portions, and say this is general guidance, not a dietitian's advice. If a question is outside the app's scope, say you are not a specialist in it. Provide general health awareness only: do not diagnose, recommend medication doses, or suggest changing or stopping medication. Direct chest pain, shortness of breath, or severe dizziness to urgent medical care. This app does not replace a clinician.";
export function buildSystem(locale: string | undefined, question: string, context: string): string {
  const arabic = /[\u0600-\u06FF]/.test(question);
  const base = arabic ? SYSTEM_AR : locale === "en" ? SYSTEM_EN : SYSTEM_AR;
  return `${base}${context}`;
}

// رؤوس أمان لكل رد من الـ Worker: منع تخمين نوع المحتوى، ومنع تخزين ردود فيها بيانات المستخدم، وعدم تسريب الـ referrer، ومنع التضمين في iframe.
const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });

async function handlePush(request: Request, path: string, userId: string, kv: PushKv, cors: Record<string, string>): Promise<Response> {
  if (typeof kv.list !== "function" || typeof kv.delete !== "function") return json({ error: "server_misconfigured" }, 500, cors);
  let body: { endpoint?: unknown; times?: unknown; tz?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "invalid_json" }, 400, cors); }
  if (!isAllowedPushEndpoint(body.endpoint)) return json({ error: "invalid_endpoint" }, 400, cors);
  const key = await recordKey(userId, body.endpoint);
  if (path === "/push/unsubscribe") { await kv.delete(key); return json({ ok: true }, 200, cors); }
  const times = sanitizeTimes(body.times);
  if (!times || !isValidTimeZone(body.tz)) return json({ error: "invalid_schedule" }, 400, cors);
  const existing = await kv.get(key);
  if (!existing) {
    const mine = await kv.list({ prefix: `push:${userId}:`, limit: MAX_SUBS_PER_USER + 1 });
    if (mine.keys.length >= MAX_SUBS_PER_USER) return json({ error: "too_many_devices" }, 429, cors);
  }
  const previous = existing ? (JSON.parse(existing) as Partial<PushRecord>) : {};
  const record: PushRecord = { endpoint: body.endpoint, times, tz: body.tz, sent: Array.isArray(previous.sent) ? previous.sent : [] };
  await kv.put(key, JSON.stringify(record), { expirationTtl: RECORD_TTL_SECONDS });
  return json({ ok: true }, 200, cors);
}

function staticFallback(question: string, locale: string): string {
  return staticReply(question, locale);
}

async function hashedIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function incrementIpRateLimit(kv: KvLike, ip: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const minute = Math.floor(Date.now() / 60_000);
  const hash = await hashedIp(ip);
  const key = `chat:ip:${hash}:${minute}`;
  const count = Number(await kv.get(key)) || 0;
  if (count >= 10) return { allowed: false, retryAfter: Math.max(1, Math.ceil(((minute + 1) * 60_000 - Date.now()) / 1000)) };
  // KV increments are best-effort under simultaneous requests; this limits normal bursts without storing raw IPs.
  await kv.put(key, String(count + 1), { expirationTtl: 120 });
  return { allowed: true, retryAfter: 0 };
}

function upstreamError(error: unknown, provider: string, model: string): ModelFailure {
  const e = error as { status?: number; message?: string; headers?: { get?: (name: string) => string | null } };
  const status = typeof e?.status === "number" ? e.status : null;
  const rawMessage = typeof e?.message === "string" ? e.message : String(error);
  const message = rawMessage.slice(0, 600); // أطول شوية عشان "retry in Ns" ونوع الحد (يومي/دقيقة) يفضلوا ظاهرين
  const header = typeof e?.headers?.get === "function" ? e.headers.get("retry-after") : null;
  const seconds = header == null ? NaN : Number(header);
  const retryAfterMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
  console.error(`[chat] ${provider}/${model} failed`, { status, message: message.slice(0, 240) });
  return { status, message, retryAfterMs };
}

type ChatMessage = { role: "user" | "assistant"; content: string };
/** سبب الرد الاحتياطي (بيتبعت للواجهة للتشخيص؛ من غير أي أسرار أو نصوص من المزوّد). */
export type FallbackReason = "no_provider_configured" | "provider_auth" | "provider_quota" | "provider_model" | "provider_timeout" | "provider_error";

/** ميزانية الوقت الكلية للمزوّدين. لازم تبقى أقل من مهلة الواجهة (35ث) وإلا الواجهة بتقطع والطلب بيفضل شغّال ويحرق الحصة. */
const AI_BUDGET_MS = 25_000;
const PER_CALL_TIMEOUT_MS = 10_000;
/** إعادة المحاولة على نفس الموديل بس لأخطاء الخادم المؤقتة (مرة واحدة وبانتظار قصير). 429 والـ timeout بينقلونا للموديل التالي فورًا. */
const MAX_ROUNDS = 3;
const ROUND_PAUSE_MS = 400;
/** فشل مؤقت يستاهل جولة تانية: خطأ خادم، timeout، شبكة، أو رد فاضي. (429/400/401/403/404 لا) */
const isTemporaryFailure = (failure: ModelFailure): boolean => failure.status === null || (failure.status >= 500 && failure.status < 600);
const isTransientServerError = (error: unknown): boolean => [500, 502, 503, 504].includes((error as { status?: number })?.status ?? -1);

function reasonFor(failure: ModelFailure): FallbackReason {
  if (failure.status === 401 || failure.status === 403) return "provider_auth";
  if (failure.status === 429) return "provider_quota";
  if (failure.status === 404 || failure.status === 400) return "provider_model";
  if (failure.status === null && /time(d)? ?out|abort/i.test(failure.message)) return "provider_timeout";
  return "provider_error";
}

/**
 * طلب واحد لمزوّد متوافق مع OpenAI.
 * - max_tokens بيشمل tokens التفكير (thinking) في Gemini 2.5/3 وفي gpt-oss. مع 500 والتفكير على medium (الافتراضي)
 *   الميزانية بتخلص في التفكير والرد بيرجع فاضي => "Empty AI response" => كل الموديلات تفشل => رد ثابت.
 *   علشان كده: reasoning_effort "low" + سقف أكبر. لو المزوّد/الموديل رفض الحقل (400) بنعيد من غيره.
 */
async function complete(client: OpenAI, model: string, system: string, messages: ChatMessage[], timeout: number): Promise<string> {
  const base = { model, max_tokens: 1024, messages: [{ role: "system" as const, content: system }, ...messages] };
  const run = (extra: { reasoning_effort?: "low" }) => withRetry(
    () => client.chat.completions.create({ ...base, ...extra }, { timeout }),
    { maxRetries: 1, maxWaitMs: 300, shouldRetry: isTransientServerError }, // السلسلة نفسها هي إعادة المحاولة: ننتقل للموديل التالي بدل ما نستنى
  );
  let response;
  try { response = await run({ reasoning_effort: "low" }); }
  catch (error) {
    if ((error as { status?: number })?.status !== 400) throw error;
    response = await run({});
  }
  const text = response.choices[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`Empty AI response (finish_reason=${response.choices[0]?.finish_reason ?? "unknown"})`);
  return text.trim();
}

async function generateReply(messages: ChatMessage[], system: string, env: Env): Promise<{ text: string; reason: FallbackReason | null }> {
  let lastFailure: ModelFailure | null = null;
  const deadline = Date.now() + AI_BUDGET_MS;
  const budget = () => Math.min(PER_CALL_TIMEOUT_MS, deadline - Date.now());
  const models = parseModels(env.GEMINI_MODELS);
  if (env.GEMINI_API_KEY && models.length) {
    const client = new OpenAI({ apiKey: env.GEMINI_API_KEY, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", maxRetries: 0 });
    // موديلات فشلت بفشل مؤقت (5xx/timeout/شبكة) في الطلب ده: بنرجع لها في جولة تانية وتالتة بدل ما نستسلم.
    // الموديلات اللي حصتها خلصت (429) أو مش متاحة (400/404) بتتخطّى لأن إعادة المحاولة عليها ملهاش فايدة.
    let pending = models;
    let authRejected = false;
    for (let round = 0; round < MAX_ROUNDS && pending.length && !authRejected; round++) {
      if (round > 0) {
        if (budget() < 3_000) break;
        await new Promise((resolve) => setTimeout(resolve, ROUND_PAUSE_MS * round));
      }
      const retryNext: string[] = [];
      for (const model of pending) {
        if (budget() < 1_500) break;
        // موديل حصته خلصت من لحظات: نتخطاه من غير أي اتصال (ده اللي بيخلّي التنقل بين كل الموديلات سريع).
        if (round === 0 && cooldowns.isCold(model)) { lastFailure ??= { status: 429, message: "all models cooling down" }; continue; }
        try {
          const text = await complete(client, model, system, messages, budget());
          cooldowns.clear(model);
          return { text, reason: null };
        } catch (error) {
          lastFailure = upstreamError(error, "Gemini", model);
          if (isTemporaryFailure(lastFailure)) retryNext.push(model);
          else cooldowns.mark(model, cooldownFor(lastFailure));
          if (lastFailure.status === 401 || lastFailure.status === 403) { authRejected = true; break; } // المفتاح نفسه مرفوض: باقي موديلات Gemini هتفشل بنفس السبب
        }
      }
      pending = retryNext;
    }
    for (const model of pending) cooldowns.mark(model, 15_000); // لو كل الجولات فشلت: نريّحه شوية في الطلبات اللي بعد كده
  }

  if (env.GROQ_API_KEY && budget() >= 1_500) {
    const model = env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
    try {
      const client = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", maxRetries: 0 });
      return { text: await complete(client, model, system, messages, budget()), reason: null };
    } catch (error) { lastFailure = upstreamError(error, "Groq", model); }
  }

  console.error("[chat] Static fallback activated", lastFailure);
  return { text: "", reason: lastFailure ? reasonFor(lastFailure) : "no_provider_configured" };
}

async function handleChat(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.RATE_KV || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "server_misconfigured" }, 500, cors);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.CHAT_RATE_LIMIT) {
    const { success } = await env.CHAT_RATE_LIMIT.limit({ key: await hashedIp(ip) });
    if (!success) return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "60" });
  } else {
    const rate = await incrementIpRateLimit(env.RATE_KV, ip);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": String(rate.retryAfter) });
  }

  const token = bearerToken(request.headers.get("Authorization"));
  const userId = token ? await verifySupabaseUser(token, env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;
  if (!userId) return json({ error: "unauthorized" }, 401, cors);
  let body: { locale?: string; messages?: { role?: unknown; content?: unknown }[]; summary?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "invalid_json" }, 400, cors); }
  if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "invalid_messages" }, 400, cors);
  const recent = body.messages.slice(-20);
  if (recent.some((message) => message && message.role === "user" && typeof message.content === "string" && message.content.length > 2000)) {
    return json({ error: "message_too_long" }, 400, cors);
  }
  const messages = recent.filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({ role: message.role as "user" | "assistant", content: (message.content as string).slice(0, 2000) }));
  const question = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  if (!messages.length || !question) return json({ error: "invalid_messages" }, 400, cors);
  // الحد اليومي بيتحسب بعد التحقق من الطلب: طلب غير صالح (JSON بايظ/رسالة طويلة) ما يستهلكش من حصة المستخدم.
  const limit = Math.max(1, Number(env.DAILY_LIMIT) || 30);
  const quota = await consumeDailyQuota(env.RATE_KV, userId, limit);
  if (!quota.allowed) return json({ error: "daily_limit" }, 429, { ...cors, "Retry-After": "3600" });
  const summary = sanitizeSummary(body.summary);
  const context = Object.keys(summary).length ? `\nOptional app summary (shared with the user's consent): ${JSON.stringify(summary)}` : "";
  const system = buildSystem(body.locale, question, context);
  let text = "";
  let reason: FallbackReason | null = "provider_error";
  try { ({ text, reason } = await generateReply(messages, system, env)); }
  catch (error) { console.error("[chat] generateReply crashed; using static fallback", upstreamError(error, "request", "unknown")); }
  if (text) return json({ text, source: "ai" }, 200, cors);
  return json({ text: staticFallback(question, body.locale ?? "ar"), source: "fallback", reason: reason ?? "provider_error" }, 200, cors);
}

/** تحليل صورة أكل: بيرجّع اسم الأكلة (من قائمة ثابتة) ووزن تقريبي بس. الصورة ما بتتخزنش، والسعرات بتتحسب في التطبيق من الجدول. */
async function handleFood(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.RATE_KV || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "server_misconfigured" }, 500, cors);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.CHAT_RATE_LIMIT) {
    const { success } = await env.CHAT_RATE_LIMIT.limit({ key: await hashedIp(ip) });
    if (!success) return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "60" });
  } else {
    const rate = await incrementIpRateLimit(env.RATE_KV, ip);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": String(rate.retryAfter) });
  }
  const token = bearerToken(request.headers.get("Authorization"));
  const userId = token ? await verifySupabaseUser(token, env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;
  if (!userId) return json({ error: "unauthorized" }, 401, cors);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_B64 + 1000) return json({ error: "image_too_large" }, 413, cors);
  let body: { image?: unknown; mime?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "invalid_json" }, 400, cors); }
  const mime = typeof body.mime === "string" ? body.mime : "";
  const image = typeof body.image === "string" ? body.image : "";
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime) || !image || !/^[A-Za-z0-9+/]+=*$/.test(image)) return json({ error: "invalid_image" }, 400, cors);
  if (image.length > MAX_IMAGE_B64) return json({ error: "image_too_large" }, 413, cors);
  const limit = Math.max(1, Number(env.FOOD_DAILY_LIMIT) || 10);
  const quota = await consumeDailyQuota(env.RATE_KV, `food:${userId}`, limit);
  if (!quota.allowed) return json({ error: "daily_limit" }, 429, { ...cors, "Retry-After": "3600" });
  const models = parseModels(env.GEMINI_MODELS);
  if (!env.GEMINI_API_KEY || !models.length) return json({ error: "food_unavailable" }, 503, cors);
  const client = new OpenAI({ apiKey: env.GEMINI_API_KEY, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", maxRetries: 0 });
  const deadline = Date.now() + AI_BUDGET_MS;
  for (const model of models) {
    const remaining = Math.min(PER_CALL_TIMEOUT_MS, deadline - Date.now());
    if (remaining < 1_500) break;
    if (cooldowns.isCold(model)) continue;
    try {
      const response = await client.chat.completions.create({
        model, max_tokens: 256,
        messages: [{ role: "user", content: [{ type: "text", text: FOOD_PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } }] }],
      }, { timeout: remaining });
      const text = response.choices[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new Error("Empty AI response");
      cooldowns.clear(model);
      const guess = parseFoodReply(text);
      return json({ dish: guess.dishId ?? "unknown", grams: guess.grams }, 200, cors);
    } catch (error) {
      const failure = upstreamError(error, "Gemini", model);
      cooldowns.mark(model, cooldownFor(failure));
      if (failure.status === 401 || failure.status === 403) break;
    }
  }
  return json({ error: "food_unavailable" }, 503, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGIN);
    if (!allowedOrigins) return Response.json({ error: "server_misconfigured" }, { status: 500 });
    const origin = request.headers.get("Origin");
    const allowedOrigin = pickAllowedOrigin(origin, allowedOrigins);
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": allowedOrigin ?? allowedOrigins[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "600", Vary: "Origin",
    };
    if (request.method === "OPTIONS") return allowedOrigin ? new Response(null, { status: 204, headers: cors }) : json({ error: "origin_not_allowed" }, 403, cors);
    if (!allowedOrigin) return json({ error: "origin_not_allowed" }, 403, cors);
    const path = new URL(request.url).pathname;
    // فحص إعداد للتشخيص: بيقول بس إيه المتضبط (true/false) من غير أي قيم أو أسرار.
    if (request.method === "GET" && path === "/api/health") {
      return json({ ok: true, configured: { kv: !!env.RATE_KV, supabase: !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY, gemini: !!env.GEMINI_API_KEY, groq: !!env.GROQ_API_KEY } }, 200, cors);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    if (path === "/push/subscribe" || path === "/push/unsubscribe") {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.RATE_KV) return json({ error: "server_misconfigured" }, 500, cors);
      const token = bearerToken(request.headers.get("Authorization"));
      const userId = token ? await verifySupabaseUser(token, env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;
      if (!userId) return json({ error: "unauthorized" }, 401, cors);
      return handlePush(request, path, userId, env.RATE_KV as PushKv, cors);
    }
    if (path === "/api/food") {
      try { return await handleFood(request, env, cors); }
      catch (error) { console.error("[food] Request failed", upstreamError(error, "request", "unknown")); return json({ error: "food_unavailable" }, 503, cors); }
    }
    if (path !== "/api/chat") return json({ error: "not_found" }, 404, cors);
    try { return await handleChat(request, env, cors); }
    catch (error) {
      console.error("[chat] Request failed", upstreamError(error, "request", "unknown"));
      return json({ error: "assistant_unavailable" }, 503, cors);
    }
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    const kv = env.RATE_KV as PushKv | undefined;
    if (!kv || typeof kv.list !== "function" || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return;
    await runDuePushes(kv, { vapidPublic: env.VAPID_PUBLIC_KEY, vapidPrivateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT || "mailto:admin@example.com", windowMin: Number(env.PUSH_WINDOW_MIN) || 5 });
  },
};
