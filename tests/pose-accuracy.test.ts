import { test } from "node:test";
import assert from "node:assert/strict";
import { angle, computeMetrics, LM } from "../src/core/pose/angles.ts";
import { createLandmarkFilter } from "../src/core/pose/one-euro.ts";
import { createFpsGovernor, lighterTier, startTier } from "../src/core/pose/model-tier.ts";
import { makeLandmarks } from "./helpers.ts";

const near = (a: number, b: number, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("angle: 3D لما z موجودة، و2D لما لأ", () => {
  near(angle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), 90);
  // نفس النقط من غير z: الزاوية المسقطة في 2D = صفر (الخطين على نفس الاتجاه)
  near(angle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0.0001, y: 0 }), 0);
  // ركبة مثنية 90 في العالم لكن الكاميرا شايفاها مسطحة: الـ3D بيرجّع 90
  near(angle({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), 90);
});

test("computeMetrics: تصحيح نسبة الأبعاد (aspect) في فيديو 4:3", () => {
  // بالبكسل (640x480) الزاوية الحقيقية عند الركبة 135
  const lms = makeLandmarks({ [LM.L_HIP]: [0.5, 0.2], [LM.L_KNEE]: [0.5, 0.5], [LM.L_ANKLE]: [0.725, 0.8] });
  const raw = computeMetrics(lms, ["knee"]).knee!;
  const fixed = computeMetrics(lms, ["knee"], 0.5, { aspect: 640 / 480 }).knee!;
  near(fixed, 135, 0.5);
  assert.ok(Math.abs(raw - 135) > 3, `من غير تصحيح الزاوية بتتشوه: ${raw}`);
});

test("computeMetrics: بيستخدم worldLandmarks (3D) لزوايا المفاصل لما تتوفر", () => {
  const lms = makeLandmarks({ [LM.L_SHOULDER]: [0.5, 0.2], [LM.L_ELBOW]: [0.5, 0.4], [LM.L_WRIST]: [0.5, 0.6] }); // مستقيم في الصورة (180)
  const world = makeLandmarks({});
  world[LM.L_SHOULDER] = { x: 0, y: 0, z: 0 };
  world[LM.L_ELBOW] = { x: 0, y: 0.3, z: 0 };
  world[LM.L_WRIST] = { x: 0, y: 0.3, z: 0.3 }; // مثني 90 في الواقع
  near(computeMetrics(lms, ["elbow"]).elbow!, 180);
  near(computeMetrics(lms, ["elbow"], 0.5, { world }).elbow!, 90);
  // لو الـ world ناقص z نرجع لـ 2D
  const noZ = makeLandmarks({});
  near(computeMetrics(lms, ["elbow"], 0.5, { world: noZ }).elbow!, 180);
});

test("One Euro: بيقلل الرعشة وقت الوقوف", () => {
  const f = createLandmarkFilter();
  const noise = [0.004, -0.003, 0.005, -0.004, 0.003, -0.005, 0.004, -0.002, 0.005, -0.004, 0.003, -0.003, 0.004, -0.005, 0.002, -0.004];
  const rawDev: number[] = [], outDev: number[] = [];
  noise.forEach((n, i) => {
    const out = f.apply([{ x: 0.5 + n, y: 0.5 + n }], i * 50)[0];
    if (i >= 4) { rawDev.push(Math.abs(n)); outDev.push(Math.abs(out.x - 0.5)); }
  });
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(outDev) < mean(rawDev) * 0.6, `${mean(outDev)} vs ${mean(rawDev)}`);
});

test("One Euro: بيتبع حركة سريعة بتأخير أقل من متوسط متحرك 5 قراءات", () => {
  const f = createLandmarkFilter();
  const xs = Array.from({ length: 30 }, (_, i) => 0.2 + i * 0.02); // 0.4/ثانية
  let last = 0;
  const win: number[] = [];
  let avg = 0;
  xs.forEach((x, i) => {
    last = f.apply([{ x, y: 0.5 }], i * 50)[0].x;
    win.push(x); if (win.length > 5) win.shift();
    avg = win.reduce((a, b) => a + b, 0) / win.length;
  });
  const truth = xs[xs.length - 1];
  assert.ok(Math.abs(truth - last) < Math.abs(truth - avg), `${truth - last} vs ${truth - avg}`);
});

test("One Euro: reset بيمسح الحالة، وz بتتفلتر لو موجودة", () => {
  const f = createLandmarkFilter();
  f.apply([{ x: 0.1, y: 0.1, z: 0.1 }], 0);
  f.reset();
  const out = f.apply([{ x: 0.9, y: 0.9, z: 0.9, visibility: 0.8 }], 100)[0];
  assert.deepEqual([out.x, out.y, out.z, out.visibility], [0.9, 0.9, 0.9, 0.8]);
});

test("الموديل: عادي = full، دقة أعلى = heavy، والنزول heavy ثم full ثم lite", () => {
  assert.equal(startTier(undefined), "full");
  assert.equal(startTier("standard"), "full");
  assert.equal(startTier("high"), "heavy");
  assert.equal(lighterTier("heavy"), "full");
  assert.equal(lighterTier("full"), "lite");
  assert.equal(lighterTier("lite"), null);
});

test("مراقب السرعة: بيتجاهل التسخين، وينزل لو متوسط الزمن عالي، وما ينزلش لو سريع", () => {
  const cfg = { window: 5, maxMeanMs: 85, warmupFrames: 2 };
  const slow = createFpsGovernor(cfg);
  const res = [200, 200, 120, 120, 120, 120, 120].map((ms) => slow.record(ms));
  assert.deepEqual(res, [false, false, false, false, false, false, true]);
  const fast = createFpsGovernor(cfg);
  assert.ok([300, 300, 30, 30, 30, 30, 30, 30, 30, 30].every((ms) => !fast.record(ms))); // التسخين البطيء ما بيحسبش
  const bad = createFpsGovernor(cfg);
  assert.equal(bad.record(Number.NaN), false);
});
