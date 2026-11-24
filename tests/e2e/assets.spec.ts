import { expect, test } from "@playwright/test";

const BASE = process.env.HEALTHMATE_BASE_URL ?? "https://steven556-maker.github.io/HEALTHMATE/";
const EXERCISE_ASSETS = [
  "squat", "pushup", "plank", "lunge", "glute-bridge", "wall-sit", "sit-to-stand",
  "burpee", "crunch", "high-knees", "jumping-jack", "running", "tricep-dip", "yoga-pose",
];

test("base-path app serves every voice cue and exercise image with valid status and MIME", async ({ request }, testInfo) => {
  const checks: Array<{ path: string; status: number; contentType: string | undefined; expected: RegExp }> = [];
  const files = [
    ...Array.from({ length: 20 }, (_, index) => ({ path: `audio/recording-${String(index + 1).padStart(2, "0")}.mp3`, expected: /^audio\/(mpeg|mp3)/i })),
    ...EXERCISE_ASSETS.map((name) => ({ path: `images/exercises/${name}.webp`, expected: /^image\/webp/i })),
    { path: "images/exercises/wall-sit.svg", expected: /^image\/svg\+xml/i },
    { path: "images/exercises/sit-to-stand.svg", expected: /^image\/svg\+xml/i },
    { path: "icon.svg", expected: /^image\/svg\+xml/i },
    { path: "healthmate-hero.svg", expected: /^image\/svg\+xml/i },
  ];
  for (const file of files) {
    const response = await request.get(new URL(file.path, BASE).toString(), { timeout: 20_000 });
    checks.push({ path: file.path, status: response.status(), contentType: response.headers()["content-type"], expected: file.expected });
  }
  await testInfo.attach("production-assets.json", {
    body: JSON.stringify(checks.map(({ expected, ...check }) => ({ ...check, expectedMime: expected.source })), null, 2),
    contentType: "application/json",
  });
  const failures = checks.filter((check) => check.status !== 200 || !check.expected.test(check.contentType ?? ""));
  console.log(`Asset check: ${checks.length - failures.length}/${checks.length} healthy; failures: ${JSON.stringify(failures.map(({ path, status, contentType }) => ({ path, status, contentType })))}`);
  expect(failures.map(({ path, status }) => `${status} ${path}`), "missing or incorrect production assets").toEqual([]);
});
