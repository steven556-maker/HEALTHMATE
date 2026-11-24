import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDaySummaries, percentChange, toDateKey } from "../src/core/analytics.ts";
import { runCoach } from "../src/core/coach/rules.ts";
import { canSyncLocalDataWithAccount } from "../src/app/account-guard.ts";

const today = new Date(2026, 10, 19, 12);

test("buildDaySummaries returns no rows for a non-positive window", () => {
  assert.deepEqual(buildDaySummaries([], {}, {}, today, 0), []);
  assert.deepEqual(buildDaySummaries([], {}, {}, today, -2), []);
});

test("toDateKey uses local calendar dates around midnight", () => {
  assert.equal(toDateKey(new Date(2026, 0, 1, 0, 1)), "2026-01-01");
  assert.equal(toDateKey(new Date(2025, 11, 31, 23, 59)), "2025-12-31");
});

test("percentChange handles non-finite values as missing data", () => {
  assert.equal(percentChange(Number.NaN, 10), null);
  assert.equal(percentChange(10, Number.POSITIVE_INFINITY), null);
});

test("coach ignores invalid sleep and adherence values", () => {
  const days: ReturnType<typeof buildDaySummaries> = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-${String(index + 1).padStart(2, "0")}`,
    sessions: [], medsTaken: 0, medsTotal: 0,
  }));
  days[6].sleepHours = Number.NaN;
  days[6].stress = 2;
  days[0].medsTaken = -1;
  days[0].medsTotal = 3;
  assert.equal(runCoach({ days }).some((item) => item.id === "low_sleep_or_stress"), false);
  assert.equal(runCoach({ days }).some((item) => item.id === "low_meds_adherence"), true);
});

test("cloud sync refuses to carry device records into a different account", () => {
  assert.equal(canSyncLocalDataWithAccount(null, "user-a"), true);
  assert.equal(canSyncLocalDataWithAccount("user-a", "user-a"), true);
  assert.equal(canSyncLocalDataWithAccount("user-a", "user-b"), false);
});
