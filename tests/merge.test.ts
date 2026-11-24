import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSnapshots, mergeSessions, mergeCheckins, mergeSettings, normalizeSession } from "../src/core/merge.ts";
import { newMedication, removeMedication, setDoseStatus, stockOf } from "../src/core/medications.ts";
import type { Medication } from "../src/core/medications.ts";

const session = (over = {}) => ({ id: "s1", exerciseId: "squat", at: 10, goodReps: 3, badReps: 1, holdSeconds: 0, updatedAt: 10, ...over });

test("جلسة اتحذفت على جهاز ما بترجعش بعد المزامنة (tombstone)", () => {
  const live = session();
  const deleted = session({ deleted: true, updatedAt: 50 });
  const merged = mergeSessions([deleted], [live]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deleted, true);
  assert.equal(mergeSessions([live], [deleted])[0].deleted, true);
});

test("الجلسات القديمة (من غير id) بتاخد نفس الـ id على كل الأجهزة ومبتتكررش", () => {
  const legacy = { exerciseId: "squat", at: 1000, goodReps: 2, badReps: 0, holdSeconds: 0 };
  assert.equal(normalizeSession(legacy)!.id, normalizeSession({ ...legacy })!.id);
  assert.equal(mergeSessions([legacy], [legacy, { ...legacy, at: 2000 }]).length, 2);
});

test("جلسات بيانات غلط بتتشال", () => {
  assert.equal(mergeSessions([{ nope: 1 }, null, 5], []).length, 0);
});

test("الإدخال اليومي: الأحدث updatedAt بيكسب لكل يوم", () => {
  const merged = mergeCheckins(
    { "2026-11-19": { sleepHours: 7, updatedAt: 20 } },
    { "2026-11-19": { sleepHours: 5, updatedAt: 10 }, "2026-11-18": { sleepHours: 8, updatedAt: 5 } },
  );
  assert.equal(merged["2026-11-19"].sleepHours, 7);
  assert.equal(merged["2026-11-18"].sleepHours, 8);
});

test("الإعدادات: بتتزامن level/muted/weeklyGoal بس، والكاميرا والخط خاصين بالجهاز", () => {
  const local = { level: "normal", muted: false, facing: "user", fontSize: "large", accepted: true, weeklyGoal: 3, updatedAt: 1 };
  const remote = { level: "easy", muted: true, facing: "environment", fontSize: "xlarge", accepted: false, weeklyGoal: 5, updatedAt: 9 };
  const merged = mergeSettings(local, remote)!;
  assert.equal(merged.level, "easy");
  assert.equal(merged.weeklyGoal, 5);
  assert.equal(merged.facing, "user");
  assert.equal(merged.fontSize, "large");
  assert.equal(merged.accepted, true);
});

test("لقطة كاملة: دمج تبادلي، والأدوية بتحافظ على التعبئة والحذف", () => {
  const base: Medication = newMedication({ id: "m1", name: "a", dose: "1", times: "09:00", stock: 7 }, 1);
  const other: Medication = newMedication({ id: "m2", name: "b", dose: "1", times: "09:00", stock: 7 }, 1);
  const local = {
    "hm.sessions": [session(), session({ id: "s2", at: 20, updatedAt: 20 })],
    "hm.medications": [setDoseStatus(base, "2026-11-19:09:00", "taken", 5), removeMedication(other, 30)],
  };
  const remote = {
    "hm.sessions": [session()],
    "hm.medications": [{ ...base, adjustments: [{ id: "r1", qty: 30, at: 7 }] }, other],
  };
  const a = mergeSnapshots(local, remote), b = mergeSnapshots(remote, local);
  assert.deepEqual(a, b);
  assert.equal((a["hm.sessions"] as unknown[]).length, 2);
  const meds = a["hm.medications"] as Medication[];
  assert.equal(stockOf(meds.find((m) => m.id === "m1")!), 7 + 30 - 1);
  assert.equal(meds.find((m) => m.id === "m2")!.deleted, true);
});

test("لقطة فاضية/ناقصة ما بتكسرش", () => {
  assert.deepEqual(mergeSnapshots({}, {}), {});
  const onlyRemote = mergeSnapshots({}, { "hm.sessions": [session()] });
  assert.equal((onlyRemote["hm.sessions"] as unknown[]).length, 1);
});
