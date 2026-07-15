/** TB-007 (pause on blur) + TB-010 (keyboard + touch, responsive) — real browser.
 * Lives inside the project (not tests/e2e/) because npm resolves @playwright/test
 * by walking up from the spec file — it must sit next to the project's
 * node_modules. Run via `npm run test:e2e` from src/two-birds. */
import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __twoBirds: { getState: () => { tick: number; birds: [number, number]; status: string }; isPaused: () => boolean };
  }
}

const state = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__twoBirds.getState());

test("TB-010: keyboard switches the correct bird on desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible();
  const before = await state(page);
  await page.keyboard.press("a");
  await expect.poll(async () => (await state(page)).birds[0]).toBe(1 - before.birds[0]);
  const mid = await state(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await state(page)).birds[1]).toBe(1 - mid.birds[1]);
});

test("TB-010: touch on left/right half switches the matching bird (mobile portrait)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const canvas = page.locator("#game");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const before = await state(page);
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await expect.poll(async () => (await state(page)).birds[0]).toBe(1 - before.birds[0]);
  const mid = await state(page);
  await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await expect.poll(async () => (await state(page)).birds[1]).toBe(1 - mid.birds[1]);
});

test("TB-007: blur pauses the game, focus resumes with state intact", async ({ page }) => {
  await page.goto("/");
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(10);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => page.evaluate(() => window.__twoBirds.isPaused())).toBe(true);
  const frozen = await state(page);
  await page.waitForTimeout(500);
  const still = await state(page);
  expect(still.tick).toBe(frozen.tick); // nothing moved while blurred
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(frozen.tick);
});
