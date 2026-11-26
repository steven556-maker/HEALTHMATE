// اختيار موديل الوضعية، والنزول لموديل أخف لو الجهاز بطيء
export type PoseTier = "heavy" | "full" | "lite";
export type PoseModelSetting = "standard" | "high";

// من الأدق للأخف
export const TIER_ORDER: PoseTier[] = ["heavy", "full", "lite"];

// "عادي" = full و"دقة أعلى" = heavy
export const startTier = (setting: PoseModelSetting | undefined): PoseTier => (setting === "high" ? "heavy" : "full");

export function lighterTier(tier: PoseTier): PoseTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

export const GOVERNOR = {
  window: 40, // عدد الإطارات اللي بنقيس عليها
  maxMeanMs: 85, // أكتر من كده = أقل من حوالي 12 إطار/ثانية
  warmupFrames: 10, // تسخين الـ GPU
} as const;

// بيرجّع true لما لازم ننزل لموديل أخف
export function createFpsGovernor(cfg: { window: number; maxMeanMs: number; warmupFrames: number } = GOVERNOR) {
  let seen = 0;
  const buf: number[] = [];
  return {
    record(ms: number): boolean {
      seen++;
      if (seen <= cfg.warmupFrames || !Number.isFinite(ms) || ms <= 0) return false;
      buf.push(ms);
      if (buf.length < cfg.window) return false;
      const mean = buf.reduce((a, b) => a + b, 0) / buf.length;
      buf.length = 0;
      return mean > cfg.maxMeanMs;
    },
    reset(): void { seen = 0; buf.length = 0; },
  };
}
