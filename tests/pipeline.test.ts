import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, LM } from "../src/core/pose/angles.ts";
import { createSmoother } from "../src/core/pose/smoothing.ts";
import { createCounter } from "../src/core/repCounter.ts";
import { metricKeysFor } from "../src/core/formChecker.ts";
import { squat } from "../src/core/exercises/squat.ts";
import { plank } from "../src/core/exercises/plank.ts";
import { makeLandmarks } from "./helpers.ts";

/** هيكل سكوات جانبي من زاوية الركبة (درجات) وميل الجذع (درجات عن الرأسي) */
function squatPose(kneeDeg: number, torsoLeanDeg = 0) {
  const th = (Math.PI - (kneeDeg * Math.PI) / 180);
  const knee: [number, number] = [0.5, 0.6];
  const ankle: [number, number] = [0.5, 0.8];
  const hip: [number, number] = [0.5 + 0.2 * Math.sin(th), 0.6 - 0.2 * Math.cos(th)];
  const lean = (torsoLeanDeg * Math.PI) / 180;
  const shoulder: [number, number] = [hip[0] + 0.25 * Math.sin(lean), hip[1] - 0.25 * Math.cos(lean)];
  return makeLandmarks({ [LM.L_SHOULDER]: shoulder, [LM.L_HIP]: hip, [LM.L_KNEE]: knee, [LM.L_ANKLE]: ankle });
}

function runPipeline(seq: [number, number][]) {
  const smoother = createSmoother(3);
  const counter = createCounter(squat, "normal");
  const keys = metricKeysFor(squat);
  seq.forEach(([knee, lean], i) => counter.update(smoother.push(computeMetrics(squatPose(knee, lean), keys)), i * 50));
  return counter.state;
}

const ramp = (from: number, to: number, n = 8): number[] => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
const goodRep = (lean = 10): [number, number][] =>
  [...ramp(175, 80), ...ramp(80, 175)].map((k) => [k, lean] as [number, number]);

test("خط كامل: landmarks ← زوايا ← تنعيم ← عدّاد (سكوات)", () => {
  const start: [number, number][] = [[175, 10], [175, 10], [175, 10]];
  const s = runPipeline([...start, ...goodRep(), ...goodRep(), ...goodRep()]);
  assert.equal(s.goodReps, 3);
  assert.equal(s.badReps, 0);
});

test("خط كامل: ظهر مايل 65° يتسجل تكرار غلط", () => {
  const s = runPipeline([[175, 10], [175, 10], ...goodRep(65)]);
  assert.equal(s.badReps, 1);
  assert.equal(s.goodReps, 0);
});

test("خط كامل: نزول سطحي لحد 98° = غلط", () => {
  const shallow: [number, number][] = [...ramp(175, 98), ...ramp(98, 175)].map((k) => [k, 10] as [number, number]);
  const s = runPipeline([[175, 10], [175, 10], ...shallow]);
  assert.equal(s.badReps, 1);
});

test("خط كامل: بلانك بوضعية مستقيمة يحسب ثواني", () => {
  const smoother = createSmoother(3);
  const counter = createCounter(plank, "normal");
  const keys = metricKeysFor(plank);
  const flat = makeLandmarks({ [LM.L_SHOULDER]: [0.1, 0.5], [LM.L_HIP]: [0.5, 0.5], [LM.L_ANKLE]: [0.9, 0.5] });
  for (let t = 0; t <= 5000; t += 50) counter.update(smoother.push(computeMetrics(flat, keys)), t);
  assert.ok(counter.state.holdSeconds > 4.9 && counter.state.holdSeconds <= 5.01, String(counter.state.holdSeconds));
});
