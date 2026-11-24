import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addStock, daysLeft, doseKey, dosesForDay, isLowStock, mergeMedication, mergeMedications, medicationSummary,
  newMedication, normalizeMedication, parseTimes, pendingReminders, removeMedication, setDoseStatus, stockOf, toggleDoseStatus,
} from "../src/core/medications.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m);
const med = (over: Partial<ReturnType<typeof newMedication>> = {}) => ({ ...newMedication({ id: "m1", name: "دواء", dose: "حبة", times: "09:00, 21:00", stock: 10 }, at(0).getTime()), ...over });

test("مفتاح الجرعة بيتبني من الجدول مش من وقت الضغط", () => {
  const doses = dosesForDay([med()], at(15));
  assert.deepEqual(doses.map((d) => d.key), ["2026-11-19:09:00", "2026-11-19:21:00"]);
});

test("تسجيل 'تم' مرتين لنفس الجرعة بيخصم من المخزون مرة واحدة", () => {
  let m = med();
  m = setDoseStatus(m, "2026-11-19:09:00", "taken", 1);
  m = setDoseStatus(m, "2026-11-19:09:00", "taken", 2);
  assert.equal(stockOf(m), 9);
});

test("الضغط على نفس الحالة تاني بيلغيها وبيرجّع المخزون", () => {
  let m = toggleDoseStatus(med(), "2026-11-19:09:00", "taken", 1);
  assert.equal(stockOf(m), 9);
  m = toggleDoseStatus(m, "2026-11-19:09:00", "taken", 2);
  assert.equal(m.log["2026-11-19:09:00"], "cleared");
  assert.equal(stockOf(m), 10);
});

test("نسبة الالتزام بتتحسب لكل جرعة مجدولة: فاتت + متسجلتش = مش أخدها", () => {
  let m = med({ createdAt: at(0).getTime() });
  m = setDoseStatus(m, "2026-11-19:09:00", "taken", 1);
  const summary = medicationSummary([m], at(22), 1);
  assert.deepEqual(summary["2026-11-19"], { taken: 1, total: 2 }); // 21:00 عدّى من غير تسجيل
  const earlier = medicationSummary([m], at(12), 1);
  assert.deepEqual(earlier["2026-11-19"], { taken: 1, total: 1 }); // 21:00 لسه ماجاش
});

test("ضغطتين بوقتين مختلفين مش بيتحسبوا جرعتين", () => {
  let m = med({ times: "09:00" });
  m = setDoseStatus(m, doseKey("2026-11-19", "09:00"), "taken", 1);
  const summary = medicationSummary([m], at(22), 1);
  assert.equal(summary["2026-11-19"].total, 1);
});

test("التذكير: بيطلق عند الميعاد، وبيقف بعد تسجيل الجرعة (تم أو فاتت)", () => {
  const m = med({ times: "09:00" });
  assert.equal(pendingReminders([m], at(8, 59), {}).length, 0);
  assert.equal(pendingReminders([m], at(9, 0), {}).length, 1);
  const logged = setDoseStatus(m, "2026-11-19:09:00", "taken", 1);
  assert.equal(pendingReminders([logged], at(9, 5), {}).length, 0);
  const missed = setDoseStatus(m, "2026-11-19:09:00", "missed", 1);
  assert.equal(pendingReminders([missed], at(9, 5), {}).length, 0);
});

test("التذكير: مرة عند الميعاد + تكرار واحد بعد 15 دقيقة، ومفيش تكرار كل دقيقة", () => {
  const m = med({ times: "09:00" });
  const notified: Record<string, number> = {};
  const fire = (now: Date) => { const due = pendingReminders([m], now, notified); for (const d of due) notified[`${d.med.id}|${d.key}`] = d.attempt; return due.length; };
  assert.equal(fire(at(9, 0)), 1);
  for (let min = 1; min < 15; min++) assert.equal(fire(at(9, min)), 0, `minute ${min}`);
  assert.equal(fire(at(9, 15)), 1);
  for (let min = 16; min < 60; min++) assert.equal(fire(at(9, min)), 0, `minute ${min}`);
});

test("المخزون: التعبئة بتزوّد، وتنبيه قبل ما يخلص بأيام", () => {
  let m = med({ initialStock: 7, times: "09:00" });
  assert.equal(daysLeft(m), 7);
  assert.equal(isLowStock(m), false);
  m = setDoseStatus(m, "2026-11-19:09:00", "taken", 1);
  m = setDoseStatus(m, "2026-11-20:09:00", "taken", 2);
  m = setDoseStatus(m, "2026-11-21:09:00", "taken", 3);
  m = setDoseStatus(m, "2026-11-22:09:00", "taken", 4);
  assert.equal(stockOf(m), 3);
  assert.equal(isLowStock(m), true);
  m = addStock(m, 30, "a1", 5);
  assert.equal(stockOf(m), 33);
  assert.equal(isLowStock(m), false);
});

test("الشكل القديم (stock/log) بيتحول من غير ما المخزون الظاهر يتغير", () => {
  const old = { id: "x", name: "n", dose: "d", times: "09:00", stock: 4, log: { "2026-11-18:09:12": "taken", "2026-11-19:09:01": "missed" } };
  const m = normalizeMedication(old)!;
  assert.equal(stockOf(m), 4);
  assert.equal(normalizeMedication({ id: 1 }), null);
});

test("parseTimes بيرفض الغلط والمكرر", () => {
  assert.deepEqual(parseTimes("21:00, 09:00"), ["09:00", "21:00"]);
  assert.equal(parseTimes("9:00"), null);
  assert.equal(parseTimes("09:00, 09:00"), null);
  assert.equal(parseTimes("24:00"), null);
});

// الدمج
test("دمج: إعادة تعبئة على جهاز ما بتتلغيش بالمخزون الأقدم على جهاز تاني", () => {
  const base = med({ initialStock: 10 });
  const deviceA = addStock(base, 30, "refill-1", 100); // اشترى علبة
  const deviceB = setDoseStatus(base, "2026-11-19:09:00", "taken", 101); // سجّل جرعة
  const merged = mergeMedication(deviceA, deviceB);
  assert.equal(stockOf(merged), 10 + 30 - 1);
  assert.deepEqual(stockOf(mergeMedication(deviceB, deviceA)), stockOf(merged));
});

test("دمج: الحذف (tombstone) ما بيرجعش تاني من الجهاز التاني", () => {
  const base = med();
  const removed = removeMedication(base, 200);
  const merged = mergeMedications([base], [removed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deleted, true);
  assert.equal(mergeMedications([removed], [base])[0].deleted, true);
  assert.equal(dosesForDay(merged, at(12)).length, 0);
});

test("دمج: سجل الجرعة الأحدث بيكسب، وإلغاء 'تم' ينتقل", () => {
  const base = med();
  const taken = setDoseStatus(base, "2026-11-19:09:00", "taken", 10);
  const undone = toggleDoseStatus(taken, "2026-11-19:09:00", "taken", 20);
  assert.equal(mergeMedication(taken, undone).log["2026-11-19:09:00"], "cleared");
  assert.equal(mergeMedication(undone, taken).log["2026-11-19:09:00"], "cleared");
});

test("دمج: الحقول الأساسية الأحدث بتكسب", () => {
  const a = { ...med(), name: "قديم", updatedAt: 1 };
  const b = { ...med(), name: "جديد", updatedAt: 2 };
  assert.equal(mergeMedication(a, b).name, "جديد");
  assert.equal(mergeMedication(b, a).name, "جديد");
});
