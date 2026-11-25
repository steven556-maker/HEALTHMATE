import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfile } from "../src/app/profile.ts";
import { ALL_LOCAL_KEYS } from "../src/app/storage.ts";

test("الملف الشخصي: قيم غلط بتتشال وحقول زيادة بتتتجاهل", () => {
  const p = parseProfile({ name: "  أحمد  ", age: 200, heightCm: 175.4, isAdmin: true, __proto__: { x: 1 } });
  assert.equal(p.name, "أحمد");
  assert.equal(p.age, undefined);
  assert.equal(p.heightCm, 175);
  assert.equal("isAdmin" in p, false);
});
test("الملف الشخصي: اسم طويل بيتقص وإدخال مش كائن بيرجع فاضي", () => {
  assert.equal(parseProfile({ name: "x".repeat(100) }).name.length, 40);
  assert.deepEqual(parseProfile("bad"), { name: "" });
  assert.deepEqual(parseProfile(null), { name: "" });
});
test("مسح كل البيانات بيشمل الملف الشخصي", () => {
  assert.ok((ALL_LOCAL_KEYS as readonly string[]).includes("hm.profile"));
});
