import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workoutImages = ["squat", "pushup", "plank", "lunge", "glute-bridge", "wall-sit", "sit-to-stand", "burpee", "crunch", "high-knees", "jumping-jack", "running", "tricep-dip", "yoga-pose"];

test("every pose-tracked exercise image and all 20 recorded cues exist in public assets", () => {
  for (const name of workoutImages) {
    const image = readFileSync(resolve(root, `web/images/exercises/${name}.webp`));
    assert.equal(image.subarray(0, 4).toString(), "RIFF", `${name} has a WebP container`);
    assert.equal(image.subarray(8, 12).toString(), "WEBP", `${name} has WebP payload`);
  }
  for (let index = 1; index <= 20; index++) {
    assert.ok(existsSync(resolve(root, `web/audio/recording-${String(index).padStart(2, "0")}.mp3`)), `recording ${index} exists`);
  }
});
