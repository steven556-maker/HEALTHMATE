import { test } from "node:test";
import assert from "node:assert/strict";
import { createCounter } from "../src/core/repCounter.ts";
import type { CounterEvent } from "../src/core/repCounter.ts";
import { EXERCISES, getExercise, needsSideView } from "../src/core/exercises/index.ts";
import { computeMetrics, LM, viewOrientation } from "../src/core/pose/angles.ts";
import { metricKeysFor } from "../src/core/formChecker.ts";
import type { Level, Metrics } from "../src/core/exercises/types.ts";
import { makeLandmarks } from "./helpers.ts";

function run(id: string, frames: Metrics[], level: Level = "normal", step = 100, opts = {}) {
  const c = createCounter(getExercise(id), level, opts);
  const ev: CounterEvent[] = [];
  frames.forEach((f, i) => ev.push(...c.update(f, i * step)));
  return { c, ev, reps: ev.filter((e) => e.type === "rep") as Extract<CounterEvent, { type: "rep" }>[] };
}
const ramp = (from: number, to: number, n = 6) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

test("كل التمارين: معرّفات فريدة وحدود منطقية", () => {
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  assert.ok(EXERCISES.length >= 7);
  for (const ex of EXERCISES) {
    if (ex.mode === "reps") for (const level of ["normal", "easy"] as const) assert.ok(ex.upAbove[level] > ex.downBelow[level], `${ex.id}/${level}`);
    assert.ok(ex.requires.length > 0 && ex.checks.length > 0, ex.id);
    assert.ok(needsSideView(ex));
    for (const c of ex.checks) assert.ok(c.needs.every((k) => metricKeysFor(ex).includes(k)), `${ex.id}.${c.id}`);
  }
  // معرّفات الفحوصات لازم تكون فريدة عبر التمارين اللي نصوصها مختلفة
  const ids = EXERCISES.flatMap((e) => e.checks.map((c) => c.id));
  for (const shared of ["depth", "back"]) assert.ok(ids.includes(shared));
});

test("لانج: تكرار صحيح، ونزول سطحي = خطأ عمق", () => {
  const good = [175, ...ramp(175, 95), ...ramp(95, 175)].map((knee) => ({ knee, torso: 10 }));
  const r = run("lunge", good);
  assert.equal(r.c.state.goodReps, 1);
  const shallow = [175, ...ramp(175, 118), ...ramp(118, 175)].map((knee) => ({ knee, torso: 10 }));
  const s = run("lunge", shallow);
  assert.deepEqual(s.reps[0].errors, ["lungeDepth"]);
});

test("جسر الأرداف (مقلوب): بيبدأ من الراحة، والتكرار = ارتفاع وبعدين رجوع", () => {
  const good = [130, 130, ...ramp(130, 176), ...ramp(176, 130)].map((hip) => ({ hip }));
  const r = run("glute_bridge", good);
  assert.equal(r.c.state.goodReps, 1);
  assert.equal(r.c.state.badReps, 0);
  // رفع ناقص: يعدّي حد الذروة (160) بس مش 168
  const partial = [130, 130, ...ramp(130, 163), ...ramp(163, 130)].map((hip) => ({ hip }));
  const p = run("glute_bridge", partial);
  assert.deepEqual(p.reps[0].errors, ["bridgeLift"]);
  assert.equal(run("glute_bridge", partial, "easy").c.state.goodReps, 1); // الوضع السهل: 163 كفاية
  // لو لسه فوق من الأول ما يبدأش العد
  const startsUp = run("glute_bridge", [175, 175, 170, 175].map((hip) => ({ hip })));
  assert.equal(startsUp.c.state.goodReps + startsUp.c.state.badReps, 0);
  // ما يعدّش لو ماوصلش الذروة
  const noPeak = run("glute_bridge", [130, 140, 150, 140, 130].map((hip) => ({ hip })));
  assert.equal(noPeak.reps.length, 0);
});

test("جلسة الحيطة: الوقت بيتحسب بس والوضعية سليمة", () => {
  const good = run("wall_sit", Array.from({ length: 51 }, () => ({ knee: 92, torso: 8 })));
  assert.ok(good.c.state.holdSeconds >= 4.9, String(good.c.state.holdSeconds));
  const high = run("wall_sit", Array.from({ length: 51 }, () => ({ knee: 140, torso: 8 })));
  assert.equal(high.c.state.holdSeconds, 0);
  assert.ok(high.ev.some((e) => e.type === "feedback" && e.id === "wallHigh"));
  const low = run("wall_sit", Array.from({ length: 11 }, () => ({ knee: 55, torso: 8 })));
  assert.ok(low.ev.some((e) => e.type === "feedback" && e.id === "wallLow"));
  const leaning = run("wall_sit", Array.from({ length: 11 }, () => ({ knee: 92, torso: 45 })));
  assert.equal(leaning.c.state.holdSeconds, 0);
});

test("الوقوف من الكرسي: 30 ثانية، وعدّ الوقفات الكاملة", () => {
  const ex = getExercise("sit_to_stand");
  assert.equal(ex.durationSec, 30);
  const one = [172, ...ramp(172, 90), ...ramp(90, 172)].map((knee) => ({ knee }));
  const r = run("sit_to_stand", [...one, ...one, ...one]);
  assert.equal(r.c.state.goodReps, 3);
  const halfSit = run("sit_to_stand", [172, ...ramp(172, 106), ...ramp(106, 172)].map((knee) => ({ knee })));
  assert.equal(halfSit.reps[0]?.errors[0], "sitDepth");
});

// حماية العدّاد من الاهتزاز والتعليق
const GOOD_SQUAT = [172, 150, 120, 100, 85, 100, 120, 150, 172].map((knee) => ({ knee, torso: 10 }));

test("اهتزاز سريع (نزول وطلوع في أقل من الحد الأدنى) ما بيتعدّش", () => {
  const glitch = [172, 172, 80, 172, 172].map((knee) => ({ knee, torso: 10 }));
  const r = run("squat", glitch, "normal", 33, { minRepMs: 400 });
  assert.equal(r.c.state.goodReps + r.c.state.badReps, 0);
  assert.ok(r.ev.some((e) => e.type === "abort" && e.reason === "too_fast"));
  // وتكرار طبيعي بنفس الإعداد بيتعدّ
  assert.equal(run("squat", GOOD_SQUAT, "normal", 200, { minRepMs: 400 }).c.state.goodReps, 1);
});

test("وقف في النص وطوّل: مرحلة النزول بتتلغي ولازم يرجع لوضع البداية", () => {
  const frames = [172, 100, ...Array.from({ length: 20 }, () => 130), 172].map((knee) => ({ knee, torso: 10 }));
  const r = run("squat", frames, "normal", 1000, { maxRepMs: 10_000 });
  assert.ok(r.ev.some((e) => e.type === "abort" && e.reason === "timeout"));
  assert.equal(r.c.state.goodReps + r.c.state.badReps, 0);
  // بعد الإلغاء ما يتعدّش الرجوع لفوق إلا لما يبدأ من جديد
  assert.equal(r.c.state.phase, "up"); // الرجوع لـ 172 بيعيد التسليح
});

test("فقد التتبع أثناء النزول لفترة طويلة بيلغي التكرار", () => {
  const c = createCounter(getExercise("squat"), "normal", { lostAbortMs: 2000 });
  c.update({ knee: 172, torso: 10 }, 0);
  c.update({ knee: 90, torso: 10 }, 100);
  assert.equal(c.state.phase, "down");
  c.update({}, 200);
  assert.equal(c.state.phase, "down");
  const ev = c.update({}, 2500);
  assert.deepEqual(ev, [{ type: "abort", reason: "lost" }]);
  assert.equal(c.state.phase, "unknown");
});

test("reset بيمسح حالة التكرار الجاري", () => {
  const c = createCounter(getExercise("squat"), "normal", { maxRepMs: 1000 });
  c.update({ knee: 172, torso: 10 }, 0);
  c.update({ knee: 90, torso: 10 }, 100);
  c.reset();
  c.update({ knee: 172, torso: 10 }, 5000);
  const ev = c.update({ knee: 172, torso: 10 }, 5100);
  assert.deepEqual(ev, []);
});

// اتجاه الكاميرا
test("اتجاه الجسم: من الأمام vs من الجنب", () => {
  const front = makeLandmarks({ [LM.L_SHOULDER]: [0.38, 0.3], [LM.R_SHOULDER]: [0.62, 0.3], [LM.L_HIP]: [0.42, 0.6], [LM.R_HIP]: [0.58, 0.6] });
  const side = makeLandmarks({ [LM.L_SHOULDER]: [0.49, 0.3], [LM.R_SHOULDER]: [0.51, 0.3], [LM.L_HIP]: [0.5, 0.6], [LM.R_HIP]: [0.5, 0.6] });
  const angled = makeLandmarks({ [LM.L_SHOULDER]: [0.45, 0.3], [LM.R_SHOULDER]: [0.55, 0.3], [LM.L_HIP]: [0.47, 0.6], [LM.R_HIP]: [0.53, 0.6] });
  assert.equal(viewOrientation(front), "front");
  assert.equal(viewOrientation(side), "side");
  assert.equal(viewOrientation(angled), "angled");
  assert.equal(viewOrientation(makeLandmarks({})), "unknown");
  assert.equal(viewOrientation(makeLandmarks({ [LM.L_SHOULDER]: [0.4, 0.3], [LM.R_SHOULDER]: [0.6, 0.3] })), "unknown");
});

test("computeMetrics بيحسب زاوية الورك للجسر من الجنب", () => {
  const A = 130;
  const k = [-Math.cos((A * Math.PI) / 180), -Math.sin((A * Math.PI) / 180)];
  const lms = makeLandmarks({ [LM.L_SHOULDER]: [0.2, 0.8], [LM.L_HIP]: [0.4, 0.8], [LM.L_KNEE]: [0.4 + 0.2 * k[0], 0.8 + 0.2 * k[1]] });
  assert.ok(Math.abs(computeMetrics(lms, ["hip"]).hip! - A) < 0.01);
});
