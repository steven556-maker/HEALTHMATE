import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/core/daily-plan.ts";
import type { PlanInput } from "../src/core/daily-plan.ts";

const base: PlanInput = { yesterday: [], meds: { total: 0, pendingDue: 0 }, mealsToday: null, hour: 10 };
const ids = (i: Partial<PlanInput>) => buildPlan({ ...base, ...i }).items.map((x) => x.id);

test("مفيش بيانات: حالة فاضية من غير أي توصية أو أرقام", () => {
  assert.deepEqual(buildPlan(base), { level: "none", items: [] });
});
test("نوم أقل من 6 ساعات = تمرين خفيف", () => {
  const p = buildPlan({ ...base, sleepHours: 5 });
  assert.equal(p.level, "light");
  assert.deepEqual(p.items.map((x) => x.id), ["lowSleep"]);
});
test("6 ساعات بالظبط مش قليل", () => {
  assert.equal(buildPlan({ ...base, sleepHours: 6 }).level, "normal");
});
test("توتر 4 أو مزاج 2 = خفيف", () => {
  assert.equal(buildPlan({ ...base, stress: 4 }).level, "light");
  assert.equal(buildPlan({ ...base, mood: 2 }).level, "light");
  assert.equal(buildPlan({ ...base, stress: 3, mood: 3 }).level, "normal");
});
test("امبارح تمرين تقيل (40 تكرار أو أكتر) = خفيف", () => {
  const p = buildPlan({ ...base, yesterday: [{ goodReps: 30, badReps: 10, holdSeconds: 0 }] });
  assert.equal(p.level, "light");
  assert.deepEqual(p.items.map((x) => x.id), ["hardYesterday"]);
  assert.equal(buildPlan({ ...base, yesterday: [{ goodReps: 10, badReps: 0, holdSeconds: 30 }] }).level, "normal");
});
test("ألم امبارح = راحة، حتى لو باقي البيانات كويسة", () => {
  const p = buildPlan({ ...base, sleepHours: 8, stress: 1, yesterday: [{ goodReps: 5, badReps: 0, holdSeconds: 0, pain: true }] });
  assert.equal(p.level, "rest");
  assert.ok(p.items.some((x) => x.id === "painYesterday"));
});
test("نوم كويس وتوتر قليل = تمرين عادي بسبب واضح", () => {
  const p = buildPlan({ ...base, sleepHours: 8, stress: 2 });
  assert.equal(p.level, "normal");
  assert.deepEqual(p.items.map((x) => x.id), ["goodRecovery"]);
});
test("الأدوية: تذكير بس بعدد الجرعات اللي فاتت، من غير أي نصيحة", () => {
  assert.deepEqual(ids({ meds: { total: 3, pendingDue: 2 } }), ["medsPending"]);
  assert.equal(buildPlan({ ...base, meds: { total: 3, pendingDue: 2 } }).items[0].n, 2);
  assert.deepEqual(ids({ meds: { total: 2, pendingDue: 0 } }), ["medsAllDone"]);
  assert.deepEqual(ids({ meds: { total: 0, pendingDue: 0 } }), []);
});
test("الأكل: تذكير بعد الساعة 2 الضهر بس، وساكت لو تتبع الأكل مش مستخدم", () => {
  assert.deepEqual(ids({ mealsToday: 0, hour: 10 }), []);
  assert.deepEqual(ids({ mealsToday: 0, hour: 15 }), ["foodNone"]);
  assert.deepEqual(ids({ mealsToday: null, hour: 20 }), []);
  assert.equal(buildPlan({ ...base, mealsToday: 2 }).items[0].n, 2);
});
test("قيم غير صالحة (NaN) بتتجاهل ومش بتكسر", () => {
  assert.equal(buildPlan({ ...base, sleepHours: Number.NaN, stress: Number.NaN }).level, "none");
});
