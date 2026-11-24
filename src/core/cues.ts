/**
 * يمنع تكرار نفس التنبيه الصوتي بسرعة ويمنع تراكب التنبيهات.
 * - نفس المفتاح: لازم يعدي perKeyMs قبل ما يتكرر.
 * - أي تنبيه: لازم يعدي globalMs من آخر تنبيه (إلا لو force).
 */
export function createCueThrottle(perKeyMs = 4000, globalMs = 1200) {
  const lastByKey = new Map<string, number>();
  let lastAny = -Infinity;
  return {
    allow(key: string, now: number, opts: { force?: boolean; gapMs?: number } = {}): boolean {
      const gap = opts.gapMs ?? perKeyMs;
      const lastKey = lastByKey.get(key) ?? -Infinity;
      if (now - lastKey < gap) return false;
      if (!opts.force && now - lastAny < globalMs) return false;
      lastByKey.set(key, now);
      lastAny = now;
      return true;
    },
    reset() {
      lastByKey.clear();
      lastAny = -Infinity;
    },
  };
}

// ترتيب الأرقام بالعامية للنطق (١ إلى ٢٠) ثم الأرقام العادية
const WORDS = ["", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة", "عشرة"];
export function sayCount(n: number): string {
  return n >= 1 && n <= 10 ? WORDS[n] : String(n);
}
