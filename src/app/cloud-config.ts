// إعدادات السحابة من متغيرات البيئة (من غير استيراد Supabase عشان الحزمة الأساسية تفضل خفيفة).
//
// مهم: Vite بيحقن القيم دي داخل الـ bundle وقت البناء (build). مفيش قراءة وقت التشغيل.
// يعني لو VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_ASSISTANT_URL كانوا فاضيين وقت `npm run build`
// (مثلًا secret ناقص في GitHub Actions) النسخة المنشورة هتفضل "مش مضبوطة" لحد ما تعيد البناء.
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

/** مشاكل الإعداد اللي اكتشفناها. بتتطبع في الـ console مرة واحدة عشان التشخيص ما يبقاش صامت. */
export const configIssues: string[] = [];

/** يشيل المسافات وعلامات الاقتباس اللي بتتسرّب أحيانًا من .env أو من نسخ/لصق الـ secrets. */
function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

function parseHttpUrl(name: string, raw: string, mode: "origin" | "keep-path"): string {
  if (!raw) return "";
  let url: URL;
  try { url = new URL(raw); } catch {
    configIssues.push(`${name} is not a valid absolute URL (got ${JSON.stringify(raw.slice(0, 60))}). Expected an absolute URL such as https://example.com`);
    return "";
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    configIssues.push(`${name} must use https:// (http:// is only allowed for localhost).`);
    return "";
  }
  return mode === "origin" ? url.origin : `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/** مفتاح service_role/secret ممنوع في المتصفح: بيتخطى RLS بالكامل. */
function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    return (JSON.parse(json) as { role?: string }).role === "service_role";
  } catch { return false; }
}

const rawSupabaseUrl = clean(env.VITE_SUPABASE_URL);
const rawSupabaseKey = clean(env.VITE_SUPABASE_ANON_KEY);
const isPlaceholder = rawSupabaseUrl.includes("your-project") || rawSupabaseKey.includes("your-supabase");

export const supabaseUrl = isPlaceholder ? "" : parseHttpUrl("VITE_SUPABASE_URL", rawSupabaseUrl, "origin");
export const supabaseKey = (() => {
  if (isPlaceholder || !rawSupabaseKey) return "";
  if (isPrivilegedKey(rawSupabaseKey)) {
    configIssues.push("VITE_SUPABASE_ANON_KEY holds a service_role/secret key. Refusing to use it in the browser; use the publishable/anon key.");
    return "";
  }
  return rawSupabaseKey;
})();

if (!rawSupabaseUrl || !rawSupabaseKey) configIssues.push("Supabase is not configured: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY were empty at BUILD time.");

export const hasSupabaseConfig = !!supabaseUrl && !!supabaseKey;
/** زر Google بيظهر بس لو اتفعّل صراحة (VITE_GOOGLE_AUTH=true) بعد إعداد المزوّد في Supabase */
export const googleAuthEnabled = hasSupabaseConfig && clean(env.VITE_GOOGLE_AUTH) === "true";
/** عنوان الـ Worker. بيُرفض لو مش URL صالح (مثلًا "VITE_ASSISTANT_URL=http://..." بسبب سطر .env مكرّر). */
export const assistantUrl = parseHttpUrl("VITE_ASSISTANT_URL", clean(env.VITE_ASSISTANT_URL), "keep-path");
export const pushPublicKey = clean(env.VITE_PUSH_PUBLIC_KEY);

if (configIssues.length && typeof console !== "undefined") console.warn("[HEALTHMATE config]", configIssues);

/**
 * الرابط اللي Supabase يرجّع له المستخدم بعد تأكيد الإيميل / استعادة كلمة المرور / Google.
 * لازم يحتوي مسار الـ base (مثلًا /HEALTHMATE/). window.location.origin لوحده بيرجّع جذر github.io وبيوصّل لـ 404.
 * ولازم نفس الرابط ده (أو نمط يغطيه) يكون في Authentication → URL Configuration → Redirect URLs.
 */
export function authRedirectUrl(): string {
  return new URL(env.BASE_URL || "/", window.location.origin).href;
}

/**
 * حالة الرابط وقت فتح الصفحة (قبل ما supabase-js يمسح الـ hash). بنلتقطها هنا عند تحميل الموديول
 * عشان لينك استعادة كلمة المرور / رسالة الخطأ ما يضيعوش في سباق مع تهيئة العميل.
 */
export const authLanding = (() => {
  if (typeof window === "undefined") return { active: false, recovery: false, error: null as string | null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const get = (key: string) => hash.get(key) ?? query.get(key);
  const type = get("type");
  const error = get("error_description") ?? (get("error_code") ? get("error_code") : null);
  const active = !!(get("access_token") || error || (type && ["recovery", "signup", "magiclink", "invite", "email_change"].includes(type)));
  return { active, recovery: type === "recovery", error };
})();
