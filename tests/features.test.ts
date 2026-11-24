import { test } from "node:test";
import assert from "node:assert/strict";
import { activeDays, bestStreak, currentStreak, earnedBadges, weekProgress } from "../src/core/streaks.ts";
import { PARQ_QUESTIONS, makeParqRecord, parqResult, readParqRecord } from "../src/core/parq.ts";
import { buildReportCsv, csvCell } from "../src/core/report.ts";
import { newMedication, setDoseStatus } from "../src/core/medications.ts";
import ar from "../src/locales/ar.json" with { type: "json" };
import en from "../src/locales/en.json" with { type: "json" };

const day = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
const rec = (d: number, good = 5) => ({ at: day(d), goodReps: good });

test("السلسلة: مستمرة لو امبارح فيه تمرين حتى لو النهارده لسه", () => {
  const days = activeDays([rec(17), rec(18)]);
  assert.equal(currentStreak(days, new Date(2026, 10, 19, 8)), 2);
  assert.equal(currentStreak(days, new Date(2026, 10, 20, 8)), 0); // اتقطعت: يومين فاتوا
  assert.equal(currentStreak(activeDays([rec(18), rec(19)]), new Date(2026, 10, 19, 23)), 2);
});

test("أطول سلسلة، وحذف جلسة (tombstone) بيتحسب", () => {
  const days = activeDays([rec(1), rec(2), rec(3), rec(10), rec(11)]);
  assert.equal(bestStreak(days), 3);
  assert.equal(activeDays([{ ...rec(1), deleted: true }]).size, 0);
});

test("الهدف الأسبوعي (الأسبوع يبدأ الاثنين)", () => {
  // 19 نوفمبر 2026 = الخميس؛ الاثنين = 16
  const days = activeDays([rec(16), rec(18), rec(15)]); // 15 = الأحد (أسبوع سابق)
  assert.deepEqual(weekProgress(days, new Date(2026, 10, 19), 3), { done: 2, goal: 3, reached: false });
  assert.equal(weekProgress(activeDays([rec(16), rec(17), rec(19)]), new Date(2026, 10, 19), 3).reached, true);
});

test("الشارات", () => {
  assert.deepEqual(earnedBadges([], 3), []);
  const records = [rec(2, 60), rec(3, 60), rec(4, 10)]; // 2 نوفمبر 2026 = الاثنين
  const badges = earnedBadges(records, 3);
  assert.ok(badges.includes("first_session") && badges.includes("streak_3") && badges.includes("reps_100") && badges.includes("weekly_goal"));
  assert.ok(!badges.includes("streak_7"));
});

test("PAR-Q: أي نعم = استشارة، ومفيش نتيجة قبل الإجابة على الكل", () => {
  const all = (v: boolean) => Object.fromEntries(PARQ_QUESTIONS.map((q) => [q, v]));
  assert.equal(parqResult(all(false)), "clear");
  assert.equal(parqResult({ ...all(false), dizzy: true }), "consult");
  assert.equal(parqResult({ heart: false }), "incomplete");
  assert.equal(makeParqRecord({ heart: false }, 1), null);
  const record = makeParqRecord(all(false), 5)!;
  assert.deepEqual(readParqRecord(JSON.parse(JSON.stringify(record))), record);
  assert.equal(readParqRecord({ answers: { heart: true }, at: 1 }), null);
});

test("CSV: تهريب الفواصل وحماية من حقن الصيغ", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-5+3"), "'-5+3");
  assert.equal(csvCell(undefined), "");
});

test("CSV التقرير: جلسات وأدوية وإدخالات داخل المدة بس", () => {
  const med = setDoseStatus(newMedication({ id: "m", name: "=cmd", dose: "حبة", times: "09:00", stock: 5 }, 0), "2026-11-19:09:00", "taken", 1);
  const csv = buildReportCsv({
    sessions: [{ exerciseId: "squat", goodReps: 8, badReps: 2, holdSeconds: 0, pain: true, at: new Date(2026, 10, 19, 8, 5).getTime() }, { exerciseId: "squat", goodReps: 1, badReps: 1, holdSeconds: 0, at: new Date(2026, 8, 1).getTime() }],
    checkins: { "2026-11-19": { sleepHours: 7 }, "2026-08-01": { sleepHours: 9 } },
    medications: [med],
    now: new Date(2026, 10, 19, 12), days: 30,
    exerciseLabel: (id) => id.toUpperCase(),
    labels: { sessions: "S", medications: "M", checkins: "C", taken: "T", missed: "X", yes: "Y", headers: { date: "date", time: "time", exercise: "ex", good: "g", bad: "b", hold: "h", pain: "p", medication: "med", dose: "dose", status: "st", sleep: "sl", sleepQuality: "sq", weight: "w", stress: "str", mood: "mo" } },
  });
  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /2026-11-19,08:05,SQUAT,8,2,0,Y/);
  assert.ok(!csv.includes("2026-09-01"));
  assert.ok(!csv.includes("2026-08-01"));
  assert.match(csv, /2026-11-19,09:00,'=cmd,حبة,T/);
});

test("ar.json و en.json نفس المفاتيح بالظبط", () => {
  const a = Object.keys(ar).sort(), e = Object.keys(en).sort();
  assert.deepEqual(a.filter((k) => !e.includes(k)), [], "missing in en");
  assert.deepEqual(e.filter((k) => !a.includes(k)), [], "missing in ar");
  for (const key of a) {
    assert.ok((ar as Record<string, string>)[key].trim() !== "", `empty ar: ${key}`);
    assert.ok((en as Record<string, string>)[key].trim() !== "", `empty en: ${key}`);
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(ph((ar as Record<string, string>)[key]), ph((en as Record<string, string>)[key]), `placeholders differ: ${key}`);
  }
});

import { buildBackup, parseBackup, MAX_BACKUP_BYTES } from "../src/core/backup.ts";
import { mergeSnapshots, normalizeSession } from "../src/core/merge.ts";

test("الألم: بيتحفظ في الجلسة وبيتدمج", () => {
  assert.equal(normalizeSession({ exerciseId: "squat", at: 5, goodReps: 0, badReps: 0, pain: true })!.pain, true);
  assert.equal(normalizeSession({ exerciseId: "squat", at: 5, goodReps: 1, badReps: 0, pain: "yes" })!.pain, undefined);
});

test("النسخة الاحتياطية: تصدير واستيراد، ورفض الملفات الغلط", () => {
  const snap = { "hm.sessions": [{ exerciseId: "squat", at: 5, goodReps: 1, badReps: 0, holdSeconds: 0 }], "hm.cloud.owner": "secret", "other": 1 };
  const backup = buildBackup(snap, new Date(2026, 10, 20));
  assert.deepEqual(Object.keys(backup.data), ["hm.sessions"]); // مفاتيح معروفة بس، ومفيش معرّف حساب
  const parsed = parseBackup(JSON.stringify(backup));
  assert.ok(parsed.ok);
  assert.equal(parseBackup("not json").ok, false);
  assert.deepEqual(parseBackup(JSON.stringify({ app: "x", version: 1, data: {} })), { ok: false, reason: "wrong_app" });
  assert.deepEqual(parseBackup(JSON.stringify({ app: "healthmate", version: 99, data: {} })), { ok: false, reason: "newer_version" });
  assert.deepEqual(parseBackup(JSON.stringify({ app: "healthmate", version: 1, data: [] })), { ok: false, reason: "invalid" });
  assert.deepEqual(parseBackup("x".repeat(MAX_BACKUP_BYTES + 1)), { ok: false, reason: "too_large" });
});

test("الاستيراد بيدمج: مبيرجّعش جلسة اتحذفت ومبيمسحش الجديد", () => {
  const local = { "hm.sessions": [{ id: "a", exerciseId: "squat", at: 1, goodReps: 1, badReps: 0, holdSeconds: 0, updatedAt: 9, deleted: true }, { id: "n", exerciseId: "plank", at: 3, goodReps: 0, badReps: 0, holdSeconds: 30, updatedAt: 3 }] };
  const imported = parseBackup(JSON.stringify(buildBackup({ "hm.sessions": [{ id: "a", exerciseId: "squat", at: 1, goodReps: 1, badReps: 0, holdSeconds: 0, updatedAt: 1 }] }, new Date())));
  assert.ok(imported.ok);
  const merged = mergeSnapshots(local, imported.ok ? imported.data : {})["hm.sessions"] as { id: string; deleted?: boolean }[];
  assert.equal(merged.find((s) => s.id === "a")!.deleted, true);
  assert.ok(merged.some((s) => s.id === "n"));
});
