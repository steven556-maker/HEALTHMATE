import { staticReply } from "../../worker/src/fallback.js";

export type Notice = "assistantNeedsSignIn" | "assistantLimit";
export type Attempt =
  | { kind: "ai"; text: string }
  | { kind: "fallback"; text: string; temporary: boolean }
  | { kind: "notice"; key: Notice }
  | { kind: "failed"; final: boolean };

const HIDDEN_ATTEMPTS = 3;
const HIDDEN_PAUSES_MS = [700, 1800];
export const TEMPORARY_REASONS = new Set(["provider_timeout", "provider_error"]);

/**
 * بيجيب رد المساعد من غير ما المستخدم يشوف أي فشل: الـ Worker بيجرّب كل موديلات Gemini، والواجهة بتعيد المحاولة بصمت،
 * ولو فشل كله بنعرض رد ثابت مناسب للسؤال. الاستثناء الوحيد رسالتان معلومتان: محتاج تسجيل دخول، أو وصل الحد اليومي.
 */
export async function getAssistantReply(question: string, endpoint: string, token: string, body: string, locale: "ar" | "en", attempt: (endpoint: string, token: string, body: string) => Promise<Attempt>, pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<{ text: string; source: "ai" | "fallback" } | { notice: Notice }> {
  let workerFallback: string | null = null;
  for (let index = 0; index < HIDDEN_ATTEMPTS; index++) {
    const result = await attempt(endpoint, token, body);
    if (result.kind === "ai") return { text: result.text, source: "ai" };
    if (result.kind === "notice") return { notice: result.key };
    if (result.kind === "fallback") { workerFallback = result.text; if (!result.temporary) break; }
    else if (result.final) break;
    if (index < HIDDEN_ATTEMPTS - 1) await pause(HIDDEN_PAUSES_MS[index] ?? 1800);
  }
  return { text: workerFallback ?? staticReply(question, locale), source: "fallback" };
}

