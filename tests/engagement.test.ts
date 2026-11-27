import { test } from "node:test";
import assert from "node:assert/strict";
import { activeDayStreak, daysSinceLastSession, detectWin, personalBest, quickStartExerciseId } from "../src/core/engagement.ts";

const NOW = new Date(2026, 10, 27, 20, 0, 0).getTime(); // 8pm local
const at = (daysAgo: number) => new Date(2026, 10, 27 - daysAgo, 10, 0, 0).getTime();

test("streak counts consecutive active days ending today", () => {
  const s = [{ at: at(0) }, { at: at(1) }, { at: at(2) }, { at: at(4) }];
  assert.equal(activeDayStreak(s, NOW), 3);
});
test("streak counts from yesterday when today has no session yet", () => {
  assert.equal(activeDayStreak([{ at: at(1) }, { at: at(2) }], NOW), 2);
});
test("streak is zero with no recent sessions", () => {
  assert.equal(activeDayStreak([{ at: at(3) }], NOW), 0);
  assert.equal(activeDayStreak([], NOW), 0);
});
test("daysSinceLastSession returns day gap or null", () => {
  assert.equal(daysSinceLastSession([], NOW), null);
  assert.equal(daysSinceLastSession([{ at: at(0) }], NOW), 0);
  assert.equal(daysSinceLastSession([{ at: at(2) }], NOW), 2);
});
test("personalBest returns max previous result or null for first time", () => {
  const s = [
    { at: at(3), exerciseId: "squat", goodReps: 8 },
    { at: at(2), exerciseId: "squat", goodReps: 12 },
    { at: at(1), exerciseId: "plank", holdSeconds: 40 },
  ];
  assert.equal(personalBest(s, "squat", "reps"), 12);
  assert.equal(personalBest(s, "plank", "hold"), 40);
  assert.equal(personalBest(s, "lunge", "reps"), null);
});
test("detectWin prefers a new personal best", () => {
  const w = detectWin({ exerciseId: "squat", mode: "reps", goodReps: 15, holdSeconds: 0, sessions: [{ at: at(1), exerciseId: "squat", goodReps: 12 }], now: NOW });
  assert.deepEqual(w, { kind: "personal_best" });
});
test("detectWin celebrates a streak extension", () => {
  const w = detectWin({ exerciseId: "squat", mode: "reps", goodReps: 5, holdSeconds: 0, sessions: [{ at: at(1), exerciseId: "squat", goodReps: 12 }], now: NOW });
  assert.deepEqual(w, { kind: "streak", days: 2 });
});
test("detectWin marks a first session of the exercise", () => {
  const w = detectWin({ exerciseId: "lunge", mode: "reps", goodReps: 4, holdSeconds: 0, sessions: [{ at: at(5), exerciseId: "squat", goodReps: 9 }], now: NOW });
  assert.deepEqual(w, { kind: "first" });
});
test("detectWin falls back to a plain well-done", () => {
  const w = detectWin({ exerciseId: "squat", mode: "reps", goodReps: 5, holdSeconds: 0, sessions: [{ at: at(0), exerciseId: "squat", goodReps: 12 }], now: NOW });
  assert.deepEqual(w, { kind: "done" });
});
test("quickStartExerciseId prefers suggested, then last done, then squat", () => {
  assert.equal(quickStartExerciseId([], "lunge"), "lunge");
  assert.equal(quickStartExerciseId([{ at: at(2), exerciseId: "plank" }, { at: at(1), exerciseId: "glute_bridge" }], null), "glute_bridge");
  assert.equal(quickStartExerciseId([], null), "squat");
});
