import test from "node:test";
import assert from "node:assert/strict";
import { getExercise } from "../src/core/exercises/index.ts";
import { metricKeysFor } from "../src/core/formChecker.ts";
import { createCounter } from "../src/core/repCounter.ts";
import { computeMetrics } from "../src/core/pose/angles.ts";
import type { Landmark, Metrics } from "../src/core/exercises/types.ts";

const ramp = (from: number, to: number, n = 6) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// دورة بايسبس كاملة لدراع واحدة: نازلة، ثني، رجوع
const curl = (rest = 170, top = 45) => [rest, ...ramp(rest, top), ...ramp(top, rest)];
const rest = (n: number, v = 170) => Array.from({ length: n }, () => v);

function frame(l: number | undefined, r: number | undefined, key = "elbow"): Metrics {
  const vals = [l, r].filter((v): v is number => v !== undefined);
  const m: Metrics = {};
  if (vals.length) m[key as "elbow"] = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (l !== undefined) m[`${key}L` as "elbowL"] = l;
  if (r !== undefined) m[`${key}R` as "elbowR"] = r;
  return m;
}
function run(id: string, frames: Metrics[]) {
  const c = createCounter(getExercise(id), "normal");
  frames.forEach((f, i) => c.update(f, i * 100));
  return c.state;
}

test("بايسبس بالتبادل: كل دراع بتعدّ تكرار (كان صفر بالمتوسط)", () => {
  const a = curl(), b = rest(a.length);
  const frames = [...a.map((v, i) => frame(v, b[i])), ...b.map((v, i) => frame(v, a[i]))];
  assert.equal(run("biceps_curl", frames).goodReps, 2);
});

test("بايسبس بالاتنين مع بعض: تكرار واحد مش اتنين", () => {
  const a = curl();
  assert.equal(run("biceps_curl", a.map((v) => frame(v, v))).goodReps, 1);
});

test("بايسبس بدراع واحدة، والتانية مش ظاهرة", () => {
  const a = curl();
  const frames = [...a, ...a].map((v) => frame(v, undefined));
  assert.equal(run("biceps_curl", frames).goodReps, 2);
});

test("بايسبس: البداية والدراع مش مفرودة تماما (145) بتتعدّ", () => {
  const a = curl(145, 60);
  assert.equal(run("biceps_curl", a.map((v) => frame(v, v))).goodReps, 1);
});

test("بايسبس: ثني ناقص بدراع واحدة بيتعدّ غلط", () => {
  const a = curl(170, 102);
  const s = run("biceps_curl", a.map((v) => frame(v, 170)));
  assert.equal(s.goodReps, 0);
  assert.equal(s.badReps, 1);
});

test("ضغط كتف بالتبادل: ضغطتين", () => {
  const press = [90, 90, ...ramp(90, 175), ...ramp(175, 90)];
  const still = rest(press.length, 90);
  const frames = [...press.map((v, i) => frame(v, still[i])), ...still.map((v, i) => frame(v, press[i]))];
  assert.equal(run("shoulder_press", frames).goodReps, 2);
});

test("رفرفة جانبية بالاتنين: تكرار واحد", () => {
  const raise = [15, ...ramp(15, 90), ...ramp(90, 15)];
  assert.equal(run("lateral_raise", raise.map((v) => frame(v, v, "shoulder"))).goodReps, 1);
});

test("المفاتيح بتطلب قياسات الدراعين لو التمرين perSide", () => {
  const keys = metricKeysFor(getExercise("biceps_curl"));
  assert.ok(keys.includes("elbowL") && keys.includes("elbowR") && keys.includes("elbow"));
  assert.ok(!metricKeysFor(getExercise("squat")).includes("elbowL"));
});

test("computeMetrics: elbowL/elbowR من كل جانب لوحده", () => {
  const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (i: number, x: number, y: number) => (lms[i] = { x, y, visibility: 1 });
  // يسار: دراع مفرودة (كتف 11 كوع 13 رسغ 15 على خط واحد). يمين: مثنية 90 درجة
  set(11, 0.6, 0.3); set(13, 0.6, 0.5); set(15, 0.6, 0.7);
  set(12, 0.4, 0.3); set(14, 0.4, 0.5); set(16, 0.5, 0.5);
  const m = computeMetrics(lms, ["elbowL", "elbowR", "elbow"]);
  assert.ok(Math.abs(m.elbowL! - 180) < 1);
  assert.ok(Math.abs(m.elbowR! - 90) < 1);
  assert.ok(Math.abs(m.elbow! - 135) < 1);
});

test("بايسبس: كوع بيوصل 90 في أعلى نقطة (زي كاميرا حقيقية) بيتعدّ صح", () => {
  const a = curl(158, 90);
  assert.equal(run("biceps_curl", a.map((v) => frame(v, undefined))).goodReps, 1);
});
