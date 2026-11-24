import { test } from "node:test";
import assert from "node:assert/strict";
import { angle, angleFromVertical, computeMetrics, bodyFraming, LM } from "../src/core/pose/angles.ts";
import { makeLandmarks } from "./helpers.ts";

const near = (a: number, b: number, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test("angle: زاوية قائمة ومستقيمة", () => {
  near(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  near(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 180);
  assert.ok(Number.isNaN(angle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 })));
});

test("angleFromVertical", () => {
  near(angleFromVertical({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 }), 0);
  near(angleFromVertical({ x: 0.5, y: 0.2 }, { x: 0.9, y: 0.6 }), 45);
});

test("computeMetrics: ركبة مستقيمة وركبة مثنية (جانب واحد ظاهر)", () => {
  const straight = makeLandmarks({
    [LM.L_HIP]: [0.5, 0.4], [LM.L_KNEE]: [0.5, 0.6], [LM.L_ANKLE]: [0.5, 0.8],
  });
  near(computeMetrics(straight, ["knee"]).knee!, 180);
  const bent = makeLandmarks({
    [LM.L_HIP]: [0.5, 0.4], [LM.L_KNEE]: [0.5, 0.6], [LM.L_ANKLE]: [0.7, 0.6],
  });
  near(computeMetrics(bent, ["knee"]).knee!, 90);
});

test("computeMetrics: landmarks منخفضة الثقة تُتجاهل", () => {
  const lms = makeLandmarks({
    [LM.L_HIP]: [0.5, 0.4, 0.2], [LM.L_KNEE]: [0.5, 0.6], [LM.L_ANKLE]: [0.5, 0.8],
  });
  assert.equal(computeMetrics(lms, ["knee"]).knee, undefined);
});

test("computeMetrics: متوسط الجانبين لما الاتنين ظاهرين", () => {
  const lms = makeLandmarks({
    [LM.L_HIP]: [0.4, 0.4], [LM.L_KNEE]: [0.4, 0.6], [LM.L_ANKLE]: [0.4, 0.8], // 180
    [LM.R_HIP]: [0.6, 0.4], [LM.R_KNEE]: [0.6, 0.6], [LM.R_ANKLE]: [0.8, 0.6], // 90
  });
  near(computeMetrics(lms, ["knee"]).knee!, 135);
});

test("hipDrop: موجب لو الورك نازل عن الخط وسالب لو مرفوع", () => {
  const sag = makeLandmarks({
    [LM.L_SHOULDER]: [0.1, 0.5], [LM.L_HIP]: [0.5, 0.55], [LM.L_ANKLE]: [0.9, 0.5],
  });
  const pike = makeLandmarks({
    [LM.L_SHOULDER]: [0.1, 0.5], [LM.L_HIP]: [0.5, 0.45], [LM.L_ANKLE]: [0.9, 0.5],
  });
  const flat = makeLandmarks({
    [LM.L_SHOULDER]: [0.1, 0.5], [LM.L_HIP]: [0.5, 0.5], [LM.L_ANKLE]: [0.9, 0.5],
  });
  assert.ok(computeMetrics(sag, ["hipDrop"]).hipDrop! > 0.05);
  assert.ok(computeMetrics(pike, ["hipDrop"]).hipDrop! < -0.05);
  near(computeMetrics(flat, ["hipDrop"]).hipDrop!, 0, 0.001);
  // نفس النتيجة لو المستخدم متجه لليسار
  const sagMirror = makeLandmarks({
    [LM.L_SHOULDER]: [0.9, 0.5], [LM.L_HIP]: [0.5, 0.55], [LM.L_ANKLE]: [0.1, 0.5],
  });
  assert.ok(computeMetrics(sagMirror, ["hipDrop"]).hipDrop! > 0.05);
});

test("bodyFraming", () => {
  const all = Object.values(LM);
  const full = makeLandmarks(Object.fromEntries(all.map((i) => [i, [0.5, 0.5]])));
  assert.equal(bodyFraming(full), "ok");
  assert.equal(bodyFraming(makeLandmarks({})), "no_body");
  const cut = makeLandmarks(Object.fromEntries(all.map((i) => [i, [0.5, i === LM.L_ANKLE ? 1.0 : 0.5]])));
  assert.equal(bodyFraming(cut), "cut_off");
  const noAnkles = makeLandmarks(
    Object.fromEntries(all.filter((i) => i !== LM.L_ANKLE && i !== LM.R_ANKLE).map((i) => [i, [0.5, 0.5]])),
  );
  assert.equal(bodyFraming(noAnkles), "too_close");
  const lowerConfidence = makeLandmarks(Object.fromEntries(all.map((i) => [i, [0.5, 0.5, 0.4]])));
  assert.equal(bodyFraming(lowerConfidence), "ok"); // camera phone pose visibility can be below 0.5 even when the person is in frame
});
