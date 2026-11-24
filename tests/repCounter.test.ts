import { test } from "node:test";
import assert from "node:assert/strict";
import { createCounter } from "../src/core/repCounter.ts";
import type { CounterEvent } from "../src/core/repCounter.ts";
import { squat } from "../src/core/exercises/squat.ts";
import { pushup } from "../src/core/exercises/pushup.ts";
import { plank } from "../src/core/exercises/plank.ts";
import { createSmoother } from "../src/core/pose/smoothing.ts";
import type { Level, Metrics } from "../src/core/exercises/types.ts";

function runSquat(knees: number[], torso = 20, level: Level = "normal") {
  const c = createCounter(squat, level);
  const events: CounterEvent[] = [];
  knees.forEach((knee, i) => events.push(...c.update({ knee, torso }, i * 100)));
  return { c, events, reps: events.filter((e) => e.type === "rep") };
}

const GOOD = [170, 150, 120, 100, 85, 100, 120, 150, 170];

test("سكوات: تكرار صحيح واحد", () => {
  const { c, reps } = runSquat(GOOD);
  assert.equal(reps.length, 1);
  assert.equal((reps[0] as any).correct, true);
  assert.equal(c.state.goodReps, 1);
  assert.equal(c.state.badReps, 0);
});

test("سكوات: نزول سطحي = تكرار خاطئ (depth)", () => {
  const { c, reps } = runSquat([170, 150, 120, 105, 120, 150, 170]);
  assert.equal(reps.length, 1);
  assert.equal((reps[0] as any).correct, false);
  assert.deepEqual((reps[0] as any).errors, ["depth"]);
  assert.equal(c.state.badReps, 1);
});

test("سكوات: ظهر مايل = تكرار خاطئ (back)", () => {
  const { reps } = runSquat(GOOD, 70);
  assert.equal((reps[0] as any).correct, false);
  assert.ok((reps[0] as any).errors.includes("back"));
});

test("الوضع السهل: نفس النزول 100° يتحسب صحيح", () => {
  const seq = [155, 140, 115, 100, 115, 140, 155];
  assert.equal((runSquat(seq, 20, "normal").reps[0] as any)?.correct, undefined); // 155 مش 'فوق' في الوضع العادي
  assert.equal((runSquat([170, 140, 115, 100, 115, 140, 170], 20, "normal").reps[0] as any).correct, false);
  assert.equal((runSquat(seq, 20, "easy").reps[0] as any).correct, true);
});

test("ما بيعدّش من غير ما يبدأ من وضع 'فوق'", () => {
  const { reps } = runSquat([100, 90, 100, 120]);
  assert.equal(reps.length, 0);
});

test("تكرارات متعددة: 3 صح و1 غلط", () => {
  const { c } = runSquat([...GOOD, ...GOOD, ...GOOD, 160, 120, 105, 120, 165]);
  assert.equal(c.state.goodReps, 3);
  assert.equal(c.state.badReps, 1);
});

test("إطارات بدون قياسات كافية تُتجاهل (ما تتعدش غلط)", () => {
  const c = createCounter(squat, "normal");
  const ev: CounterEvent[] = [];
  const frames: Metrics[] = [{ knee: 170 }, {}, { knee: 100 }, {}, {}, { knee: 85 }, { torso: 10 }, { knee: 170 }];
  frames.forEach((f, i) => ev.push(...c.update(f, i * 100)));
  assert.equal(c.state.goodReps + c.state.badReps, 1);
});

test("ضغط: عمق وخط الجسم", () => {
  const c = createCounter(pushup, "normal");
  const play = (elbow: number, bodyLine: number, t: number) => c.update({ elbow, bodyLine }, t);
  play(170, 175, 0); play(130, 175, 100); play(100, 175, 200); play(80, 175, 300); play(120, 175, 400); play(170, 175, 500);
  assert.equal(c.state.goodReps, 1);
  play(130, 150, 600); play(100, 150, 700); play(80, 150, 800); play(170, 150, 900);
  assert.equal(c.state.badReps, 1); // جسم غير مستقيم
});

test("بلانك: الوقت يتحسب بس وقت الوضعية الصحيحة", () => {
  const c = createCounter(plank, "normal");
  for (let t = 0; t <= 3000; t += 100) c.update({ hipDrop: 0.01 }, t); // 3 ثواني صح
  assert.ok(Math.abs(c.state.holdSeconds - 3) < 0.01);
  const before = c.state.holdSeconds;
  const ev: CounterEvent[] = [];
  for (let t = 3100; t <= 4000; t += 100) ev.push(...c.update({ hipDrop: 0.15 }, t)); // وسط نازل
  assert.equal(c.state.holdSeconds, before);
  assert.ok(ev.some((e) => e.type === "feedback" && e.id === "sag"));
});

test("بلانك: فجوة التتبع ما تتحسبش وفيه milestone كل 10 ثواني", () => {
  const c = createCounter(plank, "normal");
  c.update({ hipDrop: 0 }, 0);
  c.update({ hipDrop: 0 }, 5000); // فجوة 5 ثواني: ما تتحسبش
  assert.equal(c.state.holdSeconds, 0);
  let milestones = 0;
  for (let t = 5100; t <= 15200; t += 100) {
    milestones += c.update({ hipDrop: 0 }, t).filter((e) => e.type === "milestone").length;
  }
  assert.equal(milestones, 1);
});

test("بلانك: رفع الوسط (pike) يتنبّه له", () => {
  const c = createCounter(plank, "normal");
  c.update({ hipDrop: -0.01 }, 0);
  const ev = c.update({ hipDrop: -0.2 }, 100);
  assert.ok(ev.some((e) => e.type === "feedback" && e.id === "pike"));
});

test("smoother: يقلل الارتعاش", () => {
  const s = createSmoother(3);
  s.push({ knee: 100 });
  s.push({ knee: 120 });
  assert.equal(s.push({ knee: 110 }).knee, 110);
  s.reset();
  assert.equal(s.push({ knee: 50 }).knee, 50);
});
