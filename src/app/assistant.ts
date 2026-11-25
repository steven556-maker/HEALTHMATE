import { toDateKey } from "../core/analytics.ts";
import { getLocale, t } from "./i18n.ts";
import { store } from "./storage.ts";
import { assistantUrl as ASSISTANT_URL, hasSupabaseConfig } from "./cloud-config.ts";
import { $ } from "./ui.ts";
import { getProfile } from "./profile.ts";
import { staticReply } from "../../worker/src/fallback.js";
import { getAssistantReply, TEMPORARY_REASONS } from "../core/assistant-reply.ts";
import type { Attempt } from "../core/assistant-reply.ts";

const CHAT_KEY = "hm.assistant.chat";
const CONSENT_KEY = "hm.assistant.summary-consent"; // على الجهاز بس، مش بيتزامن
interface ChatItem { role: "user" | "assistant"; content: string; source?: "ai" | "fallback" }
let sending = false;

async function accessToken(): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  const { getAccessToken } = await import("./cloud-sync.ts");
  return getAccessToken();
}

function summaryConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}

function initAssistant(): void {
  const consent = $<HTMLInputElement>("assistant-consent");
  consent.checked = summaryConsent();
  consent.onchange = () => {
    try {
      if (consent.checked) localStorage.setItem(CONSENT_KEY, "1");
      else localStorage.removeItem(CONSENT_KEY);
    } catch { /* مش حرج */ }
  };
  $("btn-send-chat").onclick = () => void sendChat();
  $("chat-input").addEventListener("keydown", (e) => { const k = e as KeyboardEvent; if (k.key === "Enter" && !k.shiftKey && !k.isComposing) { k.preventDefault(); void sendChat(); } });
  window.addEventListener("healthmate:locale", () => { void updateAssistantStatus(); renderChat(); });
  window.addEventListener("healthmate:navigate", (event) => { if ((event as CustomEvent<string>).detail === "assistant") void updateAssistantStatus(); });
  void updateAssistantStatus();
  renderChat();
}

async function updateAssistantStatus(): Promise<void> {
  const status = $("assistant-status");
  const send = $("btn-send-chat") as HTMLButtonElement;
  const field = $("chat-input") as HTMLTextAreaElement;
  if (!ASSISTANT_URL) { status.textContent = t("assistantDisabled"); send.disabled = true; field.disabled = true; return; }
  // المساعد بيحتاج حساب (الـ Worker بيتحقق من التوكن ويطبّق حد يومي لكل مستخدم)
  const signedIn = !!(await accessToken());
  status.textContent = signedIn ? t("assistantEnabled") : t("assistantNeedsSignIn");
  send.disabled = !signedIn || sending;
  field.disabled = !signedIn || sending;
}

function chatHistory(): ChatItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ChatItem => !!item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string");
  } catch { return []; }
}
function saveChat(history: ChatItem[]): void {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-30))); } catch { /* المحادثة تفضل في الذاكرة للطلب ده */ }
}
const GREETING = {
  hello: ["أهلًا بيك. أنا مساعد HEALTHMATE للتوعية الصحية العامة. اسألني عن التمرين أو النوم أو الأكل أو الالتزام بالأدوية.", "Hi. I am the HEALTHMATE assistant for general health awareness. Ask about exercise, sleep, food or sticking to medication."],
  chips: [["إزاي أبدأ تمرين بسيط؟", "How do I start a simple workout?"], ["إزاي أنام أحسن؟", "How can I sleep better?"], ["إزاي أفتكر مواعيد الدوا؟", "How do I remember my medication times?"]],
} as const;
function renderGreeting(root: HTMLElement): void {
  const en = getLocale() === "en" ? 1 : 0;
  const box = document.createElement("div"); box.className = "chat-greeting";
  const p = document.createElement("p"); const nm = getProfile().name; p.textContent = (nm ? `${en ? "Hi" : "أهلًا"} ${nm}. ` : "") + GREETING.hello[en]; box.append(p);
  const row = document.createElement("div"); row.className = "chat-chips";
  for (const c of GREETING.chips) {
    const b = document.createElement("button"); b.type = "button"; b.className = "chat-chip"; b.textContent = c[en];
    b.onclick = () => { const f = $("chat-input") as HTMLTextAreaElement; if (f.disabled) return; f.value = c[en]; f.focus(); };
    row.append(b);
  }
  box.append(row); root.append(box);
}
function renderChat(typing = false): void {
  const root = $("chat-log"); root.replaceChildren();
  if (chatHistory().length === 0) renderGreeting(root);
  for (const item of chatHistory()) {
    const bubble = document.createElement("div"); bubble.className = "chat-message";
    const role = item.role === "user" ? t("you") : t("assistant");
    bubble.textContent = `${role}: ${item.content}`; root.append(bubble);
  }
  if (typing) { const bubble = document.createElement("div"); bubble.className = "chat-message chat-typing"; bubble.setAttribute("aria-label", t("assistantTyping")); bubble.textContent = t("assistantTyping"); root.append(bubble); }
  root.scrollTop = root.scrollHeight;
}

/** ملخص اختياري: بيتبعت لطرف تالت (المساعد)، فبنقصّره على أقل حقول لازمة وبس بموافقة صريحة منفصلة. الوزن مش بيتبعت أبدًا. */
function buildSummary(): Record<string, number> | undefined {
  if (!summaryConsent()) return undefined;
  const today = store.getCheckins()[toDateKey(new Date())];
  const summary: Record<string, number> = {
    sessionsLast7Days: store.getSessions().filter((session) => Date.now() - session.at < 7 * 86400000).length,
  };
  for (const key of ["sleepHours", "sleepQuality", "stress", "mood"] as const) {
    const value = today?.[key];
    if (typeof value === "number") summary[key] = value;
  }
  return summary;
}

const RETRY_DELAYS_MS = [250, 600, 1200];
const TRANSIENT_STATUS = new Set([502, 503, 504]);
/** لو الشبكة اتقطعت لحظة أو الـ Worker رجّع 502/503/504 بنعيد بسرعة (حتى 4 محاولات) قبل ما نعرض أي رسالة. الأخطاء التانية (401/429/500...) مبتتعادش. */
async function postWithRetry(endpoint: string, token: string, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(35_000), // أكبر من ميزانية الـ Worker (25ث) عشان نستلم ردّه بدل ما نقطع قبله
      });
      if (!TRANSIENT_STATUS.has(response.status) || attempt >= RETRY_DELAYS_MS.length) return response;
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      if (timedOut || attempt >= RETRY_DELAYS_MS.length) throw error; // timeout = الـ Worker أخد وقته كله، مفيش فايدة من إعادة فورية
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

/** محاولة واحدة. مبترميش خطأ: بترجّع النتيجة، والتفاصيل التقنية بتتسجّل في الـ console بس (مش للمستخدم). */
async function attemptOnce(endpoint: string, token: string, body: string): Promise<Attempt> {
  try {
    const response = await postWithRetry(endpoint, token, body);
    // الرد لازم JSON. لو جه HTML (مثلًا VITE_ASSISTANT_URL بيشاور على صفحة مش الـ Worker) نسجّل ده بوضوح.
    const data = await response.json().catch(() => null) as { text?: string; source?: "ai" | "fallback"; error?: string; reason?: string } | null;
    if (!data) { console.error("[assistant] non-JSON response — is VITE_ASSISTANT_URL the Worker URL?", { endpoint, status: response.status }); return { kind: "failed", final: false }; }
    if (response.status === 401) return { kind: "notice", key: "assistantNeedsSignIn" };
    if (response.status === 429) {
      if (data.error === "daily_limit") return { kind: "notice", key: "assistantLimit" };
      console.warn("[assistant] rate limited; retrying quietly");
      return { kind: "failed", final: false };
    }
    if (!response.ok) { console.error("[assistant] request failed", { status: response.status, error: data.error }); return { kind: "failed", final: false }; }
    if (typeof data.text !== "string" || !data.text.trim()) return { kind: "failed", final: false };
    if (data.source === "fallback") {
      console.warn("[assistant] static fallback reply; provider failed:", data.reason ?? "unknown");
      return { kind: "fallback", text: data.text.trim(), temporary: TEMPORARY_REASONS.has(data.reason ?? "") };
    }
    return { kind: "ai", text: data.text.trim() };
  } catch (error) {
    // TypeError من fetch = شبكة أو CORS (الأصل الحالي مش في ALLOWED_ORIGIN بتاع الـ Worker) أو الـ Worker مش منشور.
    if (error instanceof TypeError) console.error(`[assistant] network/CORS error calling ${ASSISTANT_URL}. Is the Worker deployed, and does its ALLOWED_ORIGIN include ${location.origin}?`, error);
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    if (timedOut) console.error("[assistant] request timed out");
    return { kind: "failed", final: timedOut }; // timeout = الـ Worker أخد وقته كله: مفيش فايدة من إعادة فورية
  }
}

async function sendChat(): Promise<void> {
  const field = $("chat-input") as HTMLTextAreaElement;
  const content = field.value.trim(); if (!content || content.length > 2000 || !ASSISTANT_URL || sending) return;
  const send = $("btn-send-chat") as HTMLButtonElement;
  if (send.disabled) return;
  const history = chatHistory(); history.push({ role: "user", content });
  saveChat(history); field.value = ""; sending = true; send.disabled = true; field.disabled = true; renderChat(true);
  try {
    const token = await accessToken();
    if (!token) { saveChat([...chatHistory(), { role: "assistant", content: t("assistantNeedsSignIn") }]); return; }
    const payload = { locale: getLocale(), messages: history.slice(-20), summary: buildSummary() };
    const base = ASSISTANT_URL.replace(/\/$/, "");
    const endpoint = /\/api\/chat$/.test(base) ? base : `${base}/api/chat`;
    const result = await getAssistantReply(content, endpoint, token, JSON.stringify(payload), getLocale(), attemptOnce);
    if ("notice" in result) saveChat([...chatHistory(), { role: "assistant", content: t(result.notice) }]);
    else saveChat([...chatHistory(), { role: "assistant", content: result.text, source: result.source }]);
  } catch (error) {
    console.error("[assistant] unexpected error", error);
    saveChat([...chatHistory(), { role: "assistant", content: staticReply(content, getLocale()), source: "fallback" }]);
  } finally { sending = false; void updateAssistantStatus(); renderChat(); }
}

export { initAssistant };
