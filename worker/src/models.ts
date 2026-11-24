// سلسلة موديلات Gemini المجانية + ذاكرة قصيرة للموديلات اللي حصتها خلصت (في ذاكرة الـ Worker نفسه، من غير أي كتابة على KV).
// كل موديل له حصة مجانية مستقلة (لكل مشروع ولكل موديل)، فلما موديل يرجّع 429 الأحسن ننتقل فورًا للتالي بدل ما نستنى.

/** كل موديلات Gemini النصية المتاحة في الطبقة المجانية حسب وثائق Google وقت الإعداد، من الأقوى للأخف. غير المتاح منها بيتخطّاه الكود تلقائيًا. */
export const FREE_GEMINI_MODELS = [
  "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview",
  "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro",
  "gemini-flash-latest", "gemini-flash-lite-latest",
];
export const DEFAULT_GEMINI_MODELS = FREE_GEMINI_MODELS.join(",");

export function parseModels(value: string | undefined, fallback = DEFAULT_GEMINI_MODELS): string[] {
  return [...new Set((value?.trim() ? value : fallback).split(",").map((model) => model.trim()).filter(Boolean))];
}

export interface ModelFailure { status: number | null; message: string; retryAfterMs?: number | null }

const SECOND = 1000;
const MIN_COOLDOWN = 5 * SECOND;
const MAX_COOLDOWN = 30 * 60 * SECOND;

/** "Please retry in 12.5s" في رسالة Google => ميلي ثانية */
export function retryInMs(message: string): number | null {
  const match = /retry in ([0-9.]+)\s*s/i.exec(message);
  return match ? Math.round(Number(match[1]) * SECOND) : null;
}

/** كام ميلي ثانية نتجنب فيها الموديل ده بعد الفشل. 0 = مفيش داعي. */
export function cooldownFor(failure: ModelFailure): number {
  const { status, message } = failure;
  if (status === 429) {
    const hinted = failure.retryAfterMs ?? retryInMs(message);
    if (hinted != null) return Math.min(MAX_COOLDOWN, Math.max(MIN_COOLDOWN, hinted));
    return /per.?day|daily/i.test(message) ? MAX_COOLDOWN : 60 * SECOND; // حد يومي: نعيد الفحص كل 30 دقيقة، حد الدقيقة: بعد دقيقة
  }
  if (status === 400 || status === 404) return 5 * 60 * SECOND; // الموديل مش متاح لهذا المفتاح/الطبقة
  return 15 * SECOND; // 5xx أو timeout أو رد فاضي: فشل مؤقت
}

export class Cooldowns {
  private until = new Map<string, number>();
  isCold(model: string, now = Date.now()): boolean {
    const end = this.until.get(model);
    if (end === undefined) return false;
    if (end <= now) { this.until.delete(model); return false; }
    return true;
  }
  mark(model: string, ms: number, now = Date.now()): void {
    if (ms > 0) this.until.set(model, now + ms);
  }
  clear(model?: string): void { if (model === undefined) this.until.clear(); else this.until.delete(model); }
}
