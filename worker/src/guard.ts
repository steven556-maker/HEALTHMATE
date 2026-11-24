// حماية الـ Worker: أصل مسموح، تحقق من مستخدم Supabase، وحد يومي لكل مستخدم. دوال صغيرة قابلة للاختبار.

/** مخزن KV بأقل واجهة محتاجينها (Cloudflare KVNamespace بيحققها) */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** ALLOWED_ORIGIN ممكن تبقى أصل واحد أو أكتر مفصولين بفاصلة. فاضية = null (الـ Worker لازم يرفض كل حاجة). */
export function parseAllowedOrigins(value: string | undefined): string[] | null {
  const list = (value ?? "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
  if (!list.length || list.some((origin) => origin === "*" || origin.includes("YOUR-APP-DOMAIN"))) return null;
  return list;
}

export function pickAllowedOrigin(origin: string | null, allowed: string[]): string | null {
  return origin && allowed.includes(origin) ? origin : null;
}

export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // UTC، بيتصفّر كل يوم
}

/**
 * عدّاد يومي لكل مستخدم. KV مش ذرّي، فالحد "تقريبي": كفاية لمنع حرق الرصيد، مش حماية مالية دقيقة.
 * (لو محتاج دقة كاملة استخدم Durable Object.) بيرجّع false لو الحد اتعدّى.
 */
export async function consumeDailyQuota(kv: KvLike, userId: string, limit: number, now = new Date()): Promise<{ allowed: boolean; used: number }> {
  const key = `rl:${userId}:${dayKey(now)}`;
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return { allowed: false, used };
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return { allowed: true, used: used + 1 };
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec(header ?? "");
  return match ? match[1] : null;
}

/** يتحقق من التوكن عن طريق Supabase Auth نفسه (مفيش أسرار JWT محتاجة تتخزن في الـ Worker) */
export async function verifySupabaseUser(token: string, supabaseUrl: string, anonKey: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
    if (!response.ok) return null;
    const user = await response.json() as { id?: unknown };
    return typeof user.id === "string" && user.id ? user.id : null;
  } catch { return null; }
}

/** الملخص المرسل للمساعد: حقول رقمية معروفة بس وفي نطاقات معقولة. أي حاجة تانية بتتشال. */
export function sanitizeSummary(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const ranges: Record<string, [number, number]> = {
    sessionsLast7Days: [0, 100], sleepHours: [0, 24], sleepQuality: [1, 5], stress: [1, 5], mood: [1, 5],
  };
  const out: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) out[key] = value;
  }
  return out;
}
