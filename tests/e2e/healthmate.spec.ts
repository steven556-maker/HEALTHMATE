import { expect, test, type Page } from "@playwright/test";

const diagnostics = new WeakMap<Page, string[]>();
const BASE = process.env.HEALTHMATE_BASE_URL ?? "https://steven556-maker.github.io/HEALTHMATE/";

test.beforeEach(async ({ page }) => {
  const entries: string[] = [];
  diagnostics.set(page, entries);
  page.on("console", (message) => { if (message.type() === "error") entries.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => entries.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => entries.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", (response) => { if (response.status() >= 400) entries.push(`http ${response.status()}: ${response.url()}`); });
});

test.afterEach(async ({ page }, testInfo) => {
  const entries = diagnostics.get(page) ?? [];
  await testInfo.attach("browser-diagnostics.txt", { body: entries.join("\n") || "No console/page/network errors captured.", contentType: "text/plain" });
  console.log(`[${testInfo.project.name}] ${testInfo.title} diagnostics (${entries.length}):\n${entries.join("\n") || "none"}`);
});

async function openApp(page: Page): Promise<void> {
  const response = await page.goto(BASE, { waitUntil: "networkidle" });
  expect(response?.status(), "production document response").toBe(200);
  await expect(page).toHaveTitle("HEALTHMATE");
  const accept = page.locator("#btn-accept");
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await expect(page.locator("#cards .exercise-card").first()).toBeVisible();
}

test("app shell loads, has no dev URLs, and switches AR/EN direction", async ({ page }) => {
  await openApp(page);
  const initial = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  expect(initial).toEqual({ lang: "ar", dir: "rtl" });

  await page.locator("#btn-language").click();
  await expect.poll(() => page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(["en", "ltr"]);
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    localUrls: performance.getEntriesByType("resource").map((r) => r.name).filter((url) => /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url)),
  }));
  expect(layout.content, "horizontal page overflow").toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.localUrls, "development URL leaked into loaded production resources").toEqual([]);
});

test("all exercise cards and photo assets render without broken images", async ({ page }) => {
  await openApp(page);
  const cards = page.locator("#cards .exercise-card");
  expect(await cards.count(), "the seven supported, pose-tracked exercises").toBe(7);

  const images = page.locator("#cards img");
  expect(await images.count(), "each tracked exercise should have its expected photo").toBe(7);
  await images.evaluateAll((nodes) => nodes.forEach((node) => { (node as HTMLImageElement).loading = "eager"; }));
  const imageResults = await images.evaluateAll(async (nodes) => Promise.all(nodes.map(async (node) => {
    const img = node as HTMLImageElement;
    try { await img.decode(); } catch { /* report precise decode/load state below */ }
    return { src: img.currentSrc || img.src, complete: img.complete, naturalWidth: img.naturalWidth };
  })));
  expect(imageResults.filter((image) => !image.complete || image.naturalWidth === 0), "broken production exercise image URLs").toEqual([]);

  await page.locator("#btn-language").click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe("ltr");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 1);
});

test("local check-in survives reload and offline/online transition in isolated browser storage", async ({ page, context }) => {
  await openApp(page);
  await context.setOffline(true);
  await page.getByRole("navigation").getByRole("button").nth(1).click();
  await page.locator("details.disclosure").filter({ has: page.locator("#in-sleep") }).locator("summary").click();
  await page.locator("#in-sleep").fill("7");
  await page.locator("#in-sleep-quality [data-v='4']").click();
  await page.locator("#in-stress [data-v='2']").click();
  await page.locator("#in-mood [data-v='4']").click();
  await page.locator("#btn-save-checkin").click();
  const savedOffline = await page.evaluate(() => localStorage.getItem("hm.checkins"));
  expect(savedOffline, "check-in should be stored locally while offline").toContain('"sleepHours":7');

  await context.setOffline(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = await page.evaluate(() => localStorage.getItem("hm.checkins"));
  expect(persisted).toBe(savedOffline);
  const cloudState = await page.evaluate(() => ({ owner: localStorage.getItem("hm.cloud.owner"), consent: localStorage.getItem("hm.cloud.consent") }));
  expect(cloudState, "test must not authenticate or write to a real cloud account").toEqual({ owner: null, consent: null });
});

test("unauthenticated account UI starts clean without creating a session", async ({ page }) => {
  await openApp(page);
  await page.locator("#btn-account").click();
  const setupNote = page.locator(".account-setup-note");
  if (await setupNote.isVisible().catch(() => false)) {
    await expect(setupNote).toContainText(/Supabase|بيانات الاتصال/i);
  } else {
    await expect(page.getByRole("heading", { name: /sign in to HEALTHMATE|سجّ?ل دخولك إلى HEALTHMATE|تسجيل الدخول إلى HEALTHMATE/i })).toBeVisible();
  }
  const state = await page.evaluate(() => ({
    authKeys: Object.keys(localStorage).filter((key) => /auth-token|supabase\.auth|cloud\.(owner|consent)/i.test(key)),
    passwordInputs: [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].map((input) => input.value),
  }));
  expect(state.authKeys).toEqual([]);
  expect(state.passwordInputs.every((value) => value.length === 0)).toBe(true);
});

test("global audio mute persists across reloads", async ({ page }) => {
  await openApp(page);
  await page.locator("#btn-settings").click();
  await page.locator("#set-mute").check();
  await expect(page.locator("#set-mute")).toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("hm.settings") ?? "{}").muted)).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#btn-settings").click();
  await expect(page.locator("#set-mute")).toBeChecked();
});

test.describe("workout audio trigger", () => {
  test.use({ permissions: ["camera"] });

  test("starting a workout requests its start cue using a synthetic camera only", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hm.settings", JSON.stringify({ accepted: true, muted: false }));
      const now = Date.now();
      localStorage.setItem("hm.parq", JSON.stringify({
        answers: { heart: false, chestPain: false, chestPainRest: false, dizzy: false, joint: false, pressureMeds: false, other: false },
        result: "clear", at: now, updatedAt: now,
      }));
    });
    const cueRequests: string[] = [];
    page.on("request", (request) => { if (/\/audio\/recording-\d+\.mp3(?:$|\?)/.test(request.url())) cueRequests.push(request.url()); });
    await openApp(page);
    expect(await page.evaluate(() => document.createElement("audio").canPlayType("audio/mpeg"))).not.toBe("");
    await page.locator("#cards .exercise-card").first().click();
    await page.locator("#btn-start").click();
    await expect(page.locator("#btn-skip-setup")).toBeVisible({ timeout: 45_000 });
    await page.locator("#btn-skip-setup").click();
    await expect.poll(() => cueRequests.length, { timeout: 8_000 }).toBeGreaterThan(0);
    expect(cueRequests[0]).toContain("recording-01.mp3");
  });
});
