import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mergeSnapshots, SYNC_KEYS } from "../core/merge.ts";
import { syncSnapshot, type SyncRow } from "../core/sync.ts";
import { readLocalSnapshot, writeLocalSnapshot } from "./local-snapshot.ts";
import type { Snapshot } from "../core/merge.ts";
import { canSyncLocalDataWithAccount } from "./account-guard.ts";
import { authRedirectUrl, hasSupabaseConfig, supabaseKey, supabaseUrl } from "./cloud-config.ts";

// مزامنة السجلات مع Supabase.
//  - الدمج على مستوى العنصر (core/merge.ts): لكل عنصر id وupdatedAt، والحذف tombstone، فمفيش اتحاد أعمى.
//  - التخزين صف JSON واحد لكل مستخدم، لكن الكتابة بـ compare-and-set على عمود version:
//    لو جهازين كتبوا مع بعض، التاني بيكتشف التعارض ويعيد الدمج بدل ما يمسح شغل الأول.
//  - الموافقة بتتحفظ (hm.cloud.consent = user id)، فالمزامنة بتكمّل بعد إعادة فتح التطبيق من غير ما المستخدم يعيدها.

export { canSyncLocalDataWithAccount };
export { mergeSnapshots };

const OWNER_KEY = "hm.cloud.owner";
const CONSENT_KEY = "hm.cloud.consent";
const LAST_SYNC_KEY = "hm.cloud.lastSync";
const TABLE = "healthmate_user_data";
const MAX_CONFLICT_RETRIES = 4;

let supabase: SupabaseClient | null = null;
try {
  if (hasSupabaseConfig) supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
} catch (error) {
  console.error("[cloud] createClient failed; check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY", error);
  supabase = null;
}

export type SyncStatus = "synced" | "failed" | "account-mismatch" | "offline";

let syncEnabled = false;
let syncTimer = 0;
let retryTimer = 0;
let retryDelay = 0;
let syncing = false;
let syncQueued = false;
let syncListenerInitialized = false;

function announceSync(result: SyncStatus): void {
  window.dispatchEvent(new CustomEvent("healthmate:cloud-sync-status", { detail: result }));
}

// تشخيص الأخطاء
// قبل كده كل الأخطاء كانت بتتبلع (`catch {}` أو `ok: !error`) فالمستخدم كان بيشوف "فشلت" من غير سبب:
// مفتاح غلط، جدول مش موجود، RLS (42501)، إيميل مش مؤكد... كله شكله واحد. دلوقتي بنسجّل السبب في الـ console
// (من غير أي أسرار) وبنحوّله لرسالة مفهومة.
export type CloudErrorKey =
  | "cloudErrEmailNotConfirmed" | "cloudErrInvalidLogin" | "cloudErrAlreadyRegistered" | "cloudErrWeakPassword"
  | "cloudErrRateLimited" | "cloudErrSignupDisabled" | "cloudErrPermission" | "cloudErrSchema" | "cloudErrSession" | "cloudErrNetwork";

interface ErrorLike { message?: string; status?: number; code?: string; name?: string }

export function classifyCloudError(error: unknown): CloudErrorKey | null {
  const e = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const code = String(e.code ?? "");
  const message = String(e.message ?? "");
  const status = typeof e.status === "number" ? e.status : 0;
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "cloudErrEmailNotConfirmed";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "cloudErrInvalidLogin";
  if (code === "user_already_exists" || /already registered/i.test(message)) return "cloudErrAlreadyRegistered";
  if (code === "weak_password" || /password should be|weak password/i.test(message)) return "cloudErrWeakPassword";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429) return "cloudErrRateLimited";
  if (code === "signup_disabled" || code === "email_provider_disabled") return "cloudErrSignupDisabled";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "cloudErrPermission";
  if (["PGRST205", "PGRST204", "42P01", "42703"].includes(code) || /schema cache|does not exist/i.test(message)) return "cloudErrSchema";
  if (status === 401 || code === "PGRST301" || /invalid api key|jwt/i.test(message)) return "cloudErrSession";
  if (e.name === "AuthRetryableFetchError" || error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) return "cloudErrNetwork";
  return null;
}

let lastErrorKey: CloudErrorKey | null = null;
/** آخر سبب فشل مفهوم (للرسائل في الواجهة). null لو السبب غير معروف. */
export function getLastCloudErrorKey(): CloudErrorKey | null { return lastErrorKey; }

function reportCloudError(context: string, error: unknown): CloudErrorKey | null {
  const e = (error && typeof error === "object" ? error : {}) as ErrorLike;
  console.error(`[cloud] ${context} failed`, { status: e.status, code: e.code, name: e.name, message: String(e.message ?? error).slice(0, 240) });
  lastErrorKey = classifyCloudError(error);
  return lastErrorKey;
}

type RemoteRow = SyncRow;

async function fetchRemote(userId: string): Promise<RemoteRow | null> {
  const { data, error } = await supabase!.from(TABLE).select("data,version").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const value = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data as Snapshot : {};
  return { data: value, version: Number(data.version) || 0 };
}

/** يكتب بشرط إن النسخة لسه هي اللي قريناها. false = جهاز تاني سبقنا (تعارض) */
async function pushRemote(userId: string, data: Snapshot, row: RemoteRow | null): Promise<boolean> {
  const now = new Date().toISOString();
  if (!row) {
    const { error } = await supabase!.from(TABLE).insert({ user_id: userId, data, version: 1, updated_at: now });
    if (!error) return true;
    if (error.code === "23505") return false; // جهاز تاني أنشأ الصف قبلنا
    throw error;
  }
  const { data: updated, error } = await supabase!.from(TABLE)
    .update({ data, version: row.version + 1, updated_at: now })
    .eq("user_id", userId).eq("version", row.version)
    .select("version");
  if (error) throw error;
  return Array.isArray(updated) && updated.length > 0;
}

async function syncOnce(userId: string): Promise<void> {
  await syncSnapshot({
    readLocal: readLocalSnapshot,
    writeLocal: writeLocalSnapshot,
    fetchRemote: () => fetchRemote(userId),
    pushRemote: (snapshot, row) => pushRemote(userId, snapshot, row),
    maxRetries: MAX_CONFLICT_RETRIES,
  });
}

function markSynced(): void {
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch { /* مش حرج */ }
}
function noteSuccess(): void {
  retryDelay = 0;
  window.clearTimeout(retryTimer);
}
function noteFailure(): void {
  retryDelay = Math.min(retryDelay ? retryDelay * 2 : 5_000, 5 * 60_000);
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(scheduleSync, retryDelay);
}

async function currentUser() {
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

async function syncAccount(): Promise<void> {
  if (!supabase || syncing) return;
  const user = await currentUser();
  if (!user) throw new Error("Sign in before syncing your health data.");
  if (!canSyncLocalDataWithAccount(localStorage.getItem(OWNER_KEY), user.id)) throw new Error("This device's local records are linked to a different account.");
  syncing = true;
  try {
    await syncOnce(user.id);
    localStorage.setItem(OWNER_KEY, user.id);
    localStorage.setItem(CONSENT_KEY, user.id);
    syncEnabled = true;
    markSynced();
    noteSuccess();
    announceSync("synced");
  } finally {
    syncing = false;
  }
}

async function syncChangedData(): Promise<void> {
  if (!supabase || !syncEnabled) return;
  if (syncing) { syncQueued = true; return; }
  if (typeof navigator !== "undefined" && navigator.onLine === false) { announceSync("offline"); return; } // online event هيرجّع المحاولة
  syncing = true;
  try {
    const user = await currentUser();
    if (!user) { syncEnabled = false; return; }
    if (localStorage.getItem(OWNER_KEY) !== user.id) {
      syncEnabled = false;
      announceSync("account-mismatch");
      return;
    }
    await syncOnce(user.id);
    lastErrorKey = null;
    markSynced();
    noteSuccess();
    announceSync("synced");
  } catch (error) {
    reportCloudError("background sync", error);
    announceSync("failed");
    noteFailure();
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; scheduleSync(); }
  }
}

function scheduleSync(): void {
  if (!syncEnabled) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => { void syncChangedData(); }, 800);
}

export interface CloudAccount {
  email: string | null;
  configured: boolean;
  /** المستخدم وافق قبل كده على مزامنة الحساب ده (بيتحفظ حتى بعد تسجيل الخروج، فمش لازم يعيد الموافقة) */
  consented: boolean;
  /** بيانات الجهاز مربوطة بحساب تاني: لازم المستخدم يختار (يحمّل بيانات الحساب ده أو يدمجها) */
  deviceLinkedElsewhere: boolean;
  /** آخر مزامنة ناجحة على الجهاز ده (ميلي ثانية) أو null */
  lastSyncAt: number | null;
}

function readLastSync(): number | null {
  try { const value = Number(localStorage.getItem(LAST_SYNC_KEY)); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}

export async function getCloudAccount(): Promise<CloudAccount> {
  if (!supabase) return { email: null, configured: false, consented: false, deviceLinkedElsewhere: false, lastSyncAt: null };
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  const owner = localStorage.getItem(OWNER_KEY);
  return {
    email: user?.email ?? null,
    configured: true,
    consented: !!user && localStorage.getItem(CONSENT_KEY) === user.id,
    deviceLinkedElsewhere: !!user && !canSyncLocalDataWithAccount(owner, user.id),
    lastSyncAt: user && owner === user.id ? readLastSync() : null,
  };
}

/** توكن الجلسة الحالية (للمساعد). null لو مش مسجّل دخول. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

export interface AuthResult { ok: boolean; errorKey?: CloudErrorKey }

function authFailure(context: string, error: unknown): AuthResult {
  return { ok: false, errorKey: reportCloudError(context, error) ?? undefined };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? authFailure("sign-in", error) : { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult & { confirmationRequired: boolean }> {
  if (!supabase) return { ok: false, confirmationRequired: false };
  // emailRedirectTo: من غيره Supabase بيستخدم "Site URL" من لوحة التحكم (الافتراضي http://localhost:3000)
  // فلينك تأكيد الإيميل بيفتح localhost بدل التطبيق المنشور.
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
  if (error) return { ...authFailure("sign-up", error), confirmationRequired: false };
  // Supabase بيرجّع user بدون identities لو الإيميل متسجّل قبل كده (حماية من كشف الحسابات): مفيش إيميل اتبعت.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, errorKey: "cloudErrAlreadyRegistered", confirmationRequired: false };
  }
  return { ok: true, confirmationRequired: !data.session };
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirectUrl() } });
  return error ? authFailure("google sign-in", error) : { ok: true };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  return error ? authFailure("password reset", error) : { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? authFailure("password update", error) : { ok: true };
}

export async function signOut(): Promise<boolean> {
  if (!supabase) return false;
  syncEnabled = false;
  window.clearTimeout(syncTimer);
  window.clearTimeout(retryTimer);
  // الموافقة (CONSENT_KEY = id المستخدم) بتفضل: تسجيل الخروج بيوقف المزامنة لأن مفيش جلسة، ولما يرجع يسجّل نفس الحساب
  // المزامنة بتكمّل لوحدها. لو عايز يلغي الموافقة نفسها بيشيل العلامة من نافذة الحساب.
  const { error } = await supabase.auth.signOut();
  return !error;
}

/** يمسح صف المستخدم من السحابة (لـ "مسح كل البيانات"). none = مفيش حساب مسجّل دخول. */
export async function deleteCloudData(): Promise<"deleted" | "none" | "failed"> {
  if (!supabase) return "none";
  try {
    const user = await currentUser();
    if (!user) return "none";
    const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id);
    if (error) { reportCloudError("delete cloud data", error); return "failed"; }
    syncEnabled = false; // المسح المحلي اللي جاي مش لازم يتزامن تاني
    window.clearTimeout(syncTimer);
    return "deleted";
  } catch (error) { reportCloudError("delete cloud data", error); return "failed"; }
}

/** "احذف حسابي وبياناتي": دالة SQL (security definer) بتحذف المستخدم من auth.users، والصف بيتحذف بالـ cascade. */
export async function deleteAccountAndData(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.rpc("delete_my_account");
    if (error) { reportCloudError("delete account", error); return false; }
    syncEnabled = false;
    window.clearTimeout(syncTimer);
    window.clearTimeout(retryTimer);
    try { await supabase.auth.signOut(); } catch { /* الحساب اتحذف أصلًا */ }
    try { localStorage.removeItem(CONSENT_KEY); localStorage.removeItem(OWNER_KEY); localStorage.removeItem(LAST_SYNC_KEY); } catch { /* مش حرج */ }
    return true;
  } catch { return false; }
}

export async function syncSignedInAccount(consentGiven: boolean): Promise<SyncStatus> {
  if (!supabase) return "failed";
  if (!consentGiven) return "failed";
  try {
    await syncAccount();
    lastErrorKey = null;
    return "synced";
  } catch (error) {
    syncEnabled = false;
    if (error instanceof Error && error.message.includes("linked to a different account")) return "account-mismatch";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    reportCloudError("manual sync", error);
    return "failed";
  }
}

export function setCloudSyncConsent(consentGiven: boolean): void {
  if (!consentGiven) {
    syncEnabled = false;
    window.clearTimeout(syncTimer);
    window.clearTimeout(retryTimer);
    try { localStorage.removeItem(CONSENT_KEY); } catch { /* المزامنة معطلة في الذاكرة */ }
    return;
  }
  void currentUser().then((user) => {
    if (user && localStorage.getItem(OWNER_KEY) === user.id) {
      localStorage.setItem(CONSENT_KEY, user.id);
      syncEnabled = true;
      scheduleSync();
    }
  }).catch(() => undefined);
}

/** بعد تسجيل الدخول: لو وافق قبل كده على الحساب ده والجهاز مربوط بيه، نزامن فورًا وبيانات التقدم ترجع من غير خطوات. */
export async function autoSyncAfterSignIn(): Promise<SyncStatus | null> {
  if (!supabase) return null;
  try {
    const user = await currentUser();
    if (!user) return null;
    if (!canSyncLocalDataWithAccount(localStorage.getItem(OWNER_KEY), user.id)) return "account-mismatch";
    if (localStorage.getItem(CONSENT_KEY) !== user.id) return null;
    return await syncSignedInAccount(true);
  } catch (error) {
    reportCloudError("auto sync after sign-in", error);
    return "failed";
  }
}

/**
 * الجهاز كان مربوط بحساب تاني (أو بحساب Google بدل الإيميل...). بدل ما المستخدم يتعلق من غير ما يشوف تقدمه:
 *  - "load": يحمّل بيانات الحساب ده من السحابة ويستبدل بيها بيانات الجهاز (بنقرأ السحابة الأول، فلو فشل مفيش حاجة بتتمسح).
 *  - "merge": يدمج بيانات الجهاز في الحساب ده.
 */
export async function resolveAccountMismatch(choice: "load" | "merge"): Promise<SyncStatus> {
  if (!supabase) return "failed";
  try {
    const user = await currentUser();
    if (!user) return "failed";
    if (choice === "load") {
      const remote = await fetchRemote(user.id);
      for (const key of SYNC_KEYS) localStorage.removeItem(key);
      writeLocalSnapshot(remote?.data ?? {});
    }
    localStorage.setItem(OWNER_KEY, user.id);
    localStorage.setItem(CONSENT_KEY, user.id);
    return await syncSignedInAccount(true);
  } catch (error) {
    reportCloudError("resolve account mismatch", error);
    return typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "failed";
  }
}

/** بعد إعادة فتح التطبيق: لو المستخدم وافق قبل كده على الحساب ده، نكمل المزامنة من غير ما يعيد الخطوات. */
export async function resumeCloudSync(): Promise<void> {
  if (!supabase) return;
  initCloudSync();
  try {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) return;
    const user = await currentUser();
    if (!user || user.id !== consent || localStorage.getItem(OWNER_KEY) !== user.id) return;
    syncEnabled = true;
    void syncChangedData();
  } catch { /* هنحاول مرة تانية عند أول تغيير */ }
}

export function initCloudSync(): void {
  if (syncListenerInitialized) return;
  syncListenerInitialized = true;
  window.addEventListener("healthmate:local-data-changed", scheduleSync);
  window.addEventListener("online", scheduleSync);
}
