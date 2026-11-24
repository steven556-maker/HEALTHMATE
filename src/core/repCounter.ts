import type { ExerciseDef, Level, Metrics } from "./exercises/types.ts";
import { evaluateChecks } from "./formChecker.ts";

export type CounterEvent =
  | { type: "phase"; phase: "up" | "down" }
  | { type: "rep"; correct: boolean; errors: string[]; msgs: string[] }
  | { type: "feedback"; id: string; msg: string }
  | { type: "milestone"; seconds: number }
  | { type: "abort"; reason: "too_fast" | "timeout" | "lost" };

export interface CounterState {
  phase: "unknown" | "up" | "down";
  goodReps: number;
  badReps: number;
  holdSeconds: number; // ثواني الثبات بوضعية صحيحة فقط (للبلانك)
}

const MAX_HOLD_DT_MS = 500; // لو الفجوة بين إطارين أكبر من كده نعتبر التتبع اتقطع ولا نحسبها

export interface CounterOptions {
  /** أقل زمن لتكرار كامل (من بداية النزول لحد الرجوع). أسرع من كده = اهتزاز/خطأ تتبع، مش تكرار. */
  minRepMs?: number;
  /** لو فضل المستخدم في مرحلة النزول أكتر من كده من غير ما يكمّل، نلغي التكرار (وقف في النص أو مشي). */
  maxRepMs?: number;
  /** لو التتبع اتقطع أثناء النزول أكتر من كده، نلغي التكرار. */
  lostAbortMs?: number;
}

/**
 * آلة حالات: فوق ← نزول ← فوق = تكرار. التمرين كله بيتعرّف كبيانات في ExerciseDef.
 * - تمارين التكرارات: لازم يبدأ المستخدم من وضع "فوق" عشان نبدأ العد.
 * - فحوصات "any" بتتفحص أثناء مرحلة النزول، و"bottom" عند أعمق نقطة.
 * - تمارين الثبات: الوقت يتحسب بس وقت ما كل فحوصات "hold" سليمة.
 */
export function createCounter(def: ExerciseDef, level: Level, options: CounterOptions = {}) {
  const state: CounterState = { phase: "unknown", goodReps: 0, badReps: 0, holdSeconds: 0 };
  const minRepMs = options.minRepMs ?? 0;
  const maxRepMs = options.maxRepMs ?? Infinity;
  const lostAbortMs = options.lostAbortMs ?? Infinity;
  // التمرين المقلوب: نقلب الإشارة فيبقى المنطق واحد (فوق = راحة، تحت = ذروة)
  const sign = def.inverted ? -1 : 1;
  const up = def.inverted ? -def.downBelow[level] : def.upAbove[level];
  const down = def.inverted ? -def.upAbove[level] : def.downBelow[level];
  const signed = (m: Metrics): number => sign * (m[def.primary] as number);

  let repErrors = new Map<string, string>(); // id -> msg
  let bottom: Metrics | null = null;
  let lastT: number | null = null;
  let nextMilestone = 10;
  let downStartedAt: number | null = null;
  let lostSince: number | null = null;

  function hasRequired(m: Metrics): boolean {
    return def.requires.every((k) => m[k] !== undefined) && m[def.primary] !== undefined;
  }

  function updateHold(m: Metrics, now: number): CounterEvent[] {
    const events: CounterEvent[] = [];
    const failed = evaluateChecks(def, m, level, "hold");
    const dt = lastT === null ? 0 : now - lastT;
    lastT = now;
    if (failed.length === 0) {
      if (dt > 0 && dt <= MAX_HOLD_DT_MS) state.holdSeconds += dt / 1000;
      if (state.holdSeconds >= nextMilestone) {
        events.push({ type: "milestone", seconds: nextMilestone });
        nextMilestone += 10;
      }
    } else {
      for (const f of failed) events.push({ type: "feedback", id: f.id, msg: f.msg });
    }
    return events;
  }

  function abort(reason: "too_fast" | "timeout" | "lost"): CounterEvent {
    repErrors = new Map();
    bottom = null;
    downStartedAt = null;
    // الاهتزاز السريع: المستخدم لسه في وضع البداية. الانتظار الطويل/فقد التتبع: لازم يرجع لوضع البداية يدويًا.
    state.phase = reason === "too_fast" ? "up" : "unknown";
    return { type: "abort", reason };
  }

  function updateReps(m: Metrics, now: number): CounterEvent[] {
    const events: CounterEvent[] = [];
    const p = signed(m);

    if (state.phase === "unknown") {
      if (p > up) {
        state.phase = "up";
        events.push({ type: "phase", phase: "up" });
      }
      return events;
    }

    if (state.phase === "up") {
      if (p < down) {
        state.phase = "down";
        repErrors = new Map();
        bottom = m;
        downStartedAt = now;
        events.push({ type: "phase", phase: "down" });
      }
      return events;
    }

    // phase === "down"
    if (downStartedAt !== null && now - downStartedAt > maxRepMs) {
      events.push(abort("timeout"));
      return events;
    }
    if (bottom === null || p < signed(bottom)) bottom = m;
    for (const f of evaluateChecks(def, m, level, "any")) {
      if (!repErrors.has(f.id)) repErrors.set(f.id, f.msg);
      events.push({ type: "feedback", id: f.id, msg: f.msg });
    }
    if (p > up) {
      if (downStartedAt !== null && now - downStartedAt < minRepMs) {
        events.push(abort("too_fast"));
        return events;
      }
      for (const f of evaluateChecks(def, bottom, level, "bottom")) repErrors.set(f.id, f.msg);
      const correct = repErrors.size === 0;
      if (correct) state.goodReps++;
      else state.badReps++;
      events.push({ type: "rep", correct, errors: [...repErrors.keys()], msgs: [...repErrors.values()] });
      state.phase = "up";
      bottom = null;
      downStartedAt = null;
      events.push({ type: "phase", phase: "up" });
    }
    return events;
  }

  return {
    state,
    /** يستقبل قياسات الإطار (بعد التنعيم) ووقته بالمللي ثانية ويرجّع أحداث */
    update(m: Metrics, nowMs: number): CounterEvent[] {
      if (!hasRequired(m)) {
        lastT = null; // التتبع اتقطع: ما نحسبش وقت ثبات على الفجوة
        if (def.mode === "reps" && state.phase === "down") {
          lostSince ??= nowMs;
          if (nowMs - lostSince > lostAbortMs) {
            lostSince = null;
            return [abort("lost")];
          }
        }
        return [];
      }
      lostSince = null;
      return def.mode === "hold" ? updateHold(m, nowMs) : updateReps(m, nowMs);
    },
    reset() {
      state.phase = "unknown";
      state.goodReps = 0;
      state.badReps = 0;
      state.holdSeconds = 0;
      repErrors = new Map();
      bottom = null;
      lastT = null;
      nextMilestone = 10;
      downStartedAt = null;
      lostSince = null;
    },
  };
}
