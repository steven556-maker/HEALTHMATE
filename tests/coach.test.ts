import { test } from "node:test";
import assert from "node:assert/strict";
import { runCoach, RULES } from "../src/core/coach/rules.ts";
import type { DaySummary, SessionRecord } from "../src/core/coach/rules.ts";
import { summarizeWeek, percentChange, buildDaySummaries, toDateKey } from "../src/core/analytics.ts";
import { createCueThrottle, sayCount } from "../src/core/cues.ts";

const sess = (good: number, bad: number, at = 0, exerciseId = "squat"): SessionRecord => ({
  exerciseId, goodReps: good, badReps: bad, holdSeconds: 0, at,
});
const day = (over: Partial<DaySummary> = {}): DaySummary => ({
  date: "2026-11-18", sessions: [sess(5, 0)], medsTaken: 0, medsTotal: 0, ...over,
});
const week = (over: Partial<DaySummary>[] = []): DaySummary[] =>
  Array.from({ length: 7 }, (_, i) => day({ date: `2026-11-${12 + i}`, ...(over[i] ?? {}) }));

const ids = (ds: DaySummary[]) => runCoach({ days: ds }).map((s) => s.id);

test("نوم قليل = اقتراح تخفيف مع سبب", () => {
  const ds = week();
  ds[6] = day({ sleepHours: 4.5 });
  const s = runCoach({ days: ds }).find((x) => x.id === "low_sleep_or_stress")!;
  assert.equal(s.action, "lighter");
  assert.match(s.reason, /4\.5/);
});

test("نوم قليل + إجهاد عالي = راحة", () => {
  const ds = week();
  ds[6] = day({ sleepHours: 5, stress: 5 });
  assert.equal(runCoach({ days: ds }).find((x) => x.id === "low_sleep_or_stress")!.action, "rest");
});

test("نوم كافي وإجهاد منخفض = لا اقتراح", () => {
  const ds = week();
  ds[6] = day({ sleepHours: 8, stress: 2 });
  assert.ok(!ids(ds).includes("low_sleep_or_stress"));
});

test("3 أيام بدون تمرين = جلسة 10 دقايق", () => {
  const ds = week();
  for (const i of [4, 5, 6]) ds[i] = day({ sessions: [] });
  assert.ok(ids(ds).includes("idle_days"));
  ds[6] = day();
  assert.ok(!ids(ds).includes("idle_days"));
});

test("أخطاء أكتر من 30% = وضع سهل", () => {
  const ds = week(Array.from({ length: 7 }, () => ({ sessions: [] })));
  ds[6] = day({ sessions: [sess(3, 5)] });
  const s = runCoach({ days: ds }).find((x) => x.id.startsWith("high_error_rate"))!;
  assert.equal(s.action, "easy_mode");
  assert.equal(s.severity, "warn");
});

test("أخطاء قليلة العدد (أقل من 6 تكرارات) ما تتحكمش", () => {
  const ds = week();
  ds[6] = day({ sessions: [sess(1, 3)] });
  assert.ok(!ids(ds).some((i) => i.startsWith("high_error_rate")));
});

test("التزام الدواء أقل من 70%", () => {
  const ds = week(Array.from({ length: 7 }, () => ({ medsTaken: 1, medsTotal: 2 })));
  const s = runCoach({ days: ds }).find((x) => x.id === "low_meds_adherence")!;
  assert.match(s.reason, /50%/);
  // لا يذكر جرعات أو تغيير دواء
  assert.doesNotMatch(s.title + s.reason, /زوّد الجرعة|قلّل الجرعة|غيّر الدواء/);
});

test("بيانات دواء قليلة جدًا ما تطلعش اقتراح", () => {
  const ds = week();
  ds[6] = day({ medsTaken: 0, medsTotal: 2 });
  assert.ok(!ids(ds).includes("low_meds_adherence"));
});

test("تحسن مستمر 3 جلسات", () => {
  const ds = week();
  ds[2] = day({ sessions: [sess(6, 4, 1)] }); // 60%
  ds[4] = day({ sessions: [sess(7, 3, 2)] }); // 70%
  ds[6] = day({ sessions: [sess(9, 1, 3)] }); // 90%
  assert.ok(ids(ds).includes("steady_improvement"));
});

test("لا تحسن لو الدقة نزلت", () => {
  const ds = week();
  ds[2] = day({ sessions: [sess(9, 1, 1)] });
  ds[4] = day({ sessions: [sess(7, 3, 2)] });
  ds[6] = day({ sessions: [sess(9, 1, 3)] });
  assert.ok(!ids(ds).includes("steady_improvement"));
});

test("الترتيب بالأهمية: warn قبل care قبل info", () => {
  const ds = week();
  ds[6] = day({ sleepHours: 4, sessions: [sess(2, 6)] });
  const sev = runCoach({ days: ds }).map((s) => s.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => ({ warn: 0, care: 1, info: 2 })[a] - ({ warn: 0, care: 1, info: 2 })[b]));
});

test("كل القواعد تقدم سببًا نصيًا", () => {
  assert.ok(RULES.length >= 5);
  const ds = week(Array.from({ length: 7 }, () => ({ medsTaken: 0, medsTotal: 2, sleepHours: 4, sessions: [sess(1, 9)] })));
  for (const s of runCoach({ days: ds })) assert.ok(s.reason.length > 10);
});

test("analytics: ملخص أسبوع ومقارنة", () => {
  const a = summarizeWeek(week([{ sessions: [sess(8, 2)] }]));
  assert.equal(a.goodReps, 8 + 6 * 5);
  const cur = summarizeWeek([day({ sessions: [sess(9, 1)] })]);
  const prev = summarizeWeek([day({ sessions: [sess(6, 4)] })]);
  assert.equal(Math.round(percentChange(cur.accuracy, prev.accuracy)!), 50);
  assert.equal(percentChange(null, 0.5), null);
  assert.equal(percentChange(1, 0), null);
});

test("analytics: buildDaySummaries", () => {
  const end = new Date(2026, 10, 18, 12);
  const at = new Date(2026, 10, 17, 9).getTime();
  const out = buildDaySummaries([sess(5, 1, at)], { "2026-11-18": { sleepHours: 7 } }, {}, end, 7);
  assert.equal(out.length, 7);
  assert.equal(out[6].date, "2026-11-18");
  assert.equal(out[6].sleepHours, 7);
  assert.equal(out[5].sessions.length, 1);
  assert.equal(toDateKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("cues: نفس التنبيه ما يتكررش قبل 4 ثواني", () => {
  const t = createCueThrottle();
  assert.equal(t.allow("depth", 0), true);
  assert.equal(t.allow("depth", 3000), false);
  assert.equal(t.allow("depth", 4100), true);
});

test("cues: تنبيهين مختلفين ما يتراكبوش", () => {
  const t = createCueThrottle();
  assert.equal(t.allow("a", 0), true);
  assert.equal(t.allow("b", 500), false);
  assert.equal(t.allow("b", 500, { force: true }), true);
  assert.equal(sayCount(3), "تلاتة");
  assert.equal(sayCount(14), "14");
});
