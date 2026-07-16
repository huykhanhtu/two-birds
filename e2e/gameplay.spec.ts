/** Real-browser e2e: TB-007 (pause on blur), TB-010 (keyboard + touch, responsive),
 * TB-020 (idle Start screen), TB-018/TB-021 (best score persist + New best! + restart).
 * Lives inside the project (not tests/e2e/) because npm resolves @playwright/test
 * by walking up from the spec file — it must sit next to the project's
 * node_modules. Run via `npm run test:e2e` from src/two-birds. */
import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __twoBirds: {
      getState: () => { tick: number; birds: [number, number]; status: string; seedsEaten: number };
      isPaused: () => boolean;
      getScore: () => number;
      getBest: () => number;
      isNewBest: () => boolean;
      isMuted: () => boolean;
      getName: () => string;
    };
  }
}

type Pg = import("@playwright/test").Page;
const state = (page: Pg) => page.evaluate(() => window.__twoBirds.getState());
const status = (p: Pg) => p.evaluate(() => window.__twoBirds.getState().status);
const score = (p: Pg) => p.evaluate(() => window.__twoBirds.getScore());
const best = (p: Pg) => p.evaluate(() => window.__twoBirds.getBest());
const isNewBest = (p: Pg) => p.evaluate(() => window.__twoBirds.isNewBest());

/** Dismiss the Start screen (idle → running). Space never doubles as a lane switch
 * (the input adapter ignores it and startRun() drains), so birds stay [0,1]. */
async function start(page: Pg): Promise<void> {
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).status).toBe("running");
}

test("TB-010: keyboard switches the correct bird on desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible();
  await start(page);
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
  // first tap starts the game (Start screen); it must not switch a lane
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await expect.poll(async () => (await state(page)).status).toBe("running");
  const before = await state(page);
  expect(before.birds).toEqual([0, 1]); // starting tap did NOT leak as a switch
  await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await expect.poll(async () => (await state(page)).birds[0]).toBe(1 - before.birds[0]);
  const mid = await state(page);
  await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await expect.poll(async () => (await state(page)).birds[1]).toBe(1 - mid.birds[1]);
});

test("TB-007: blur pauses the game, focus resumes with state intact", async ({ page }) => {
  await page.goto("/");
  await start(page);
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

test("TB-020: opens on the idle Start screen and does not tick until first input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible();
  const s0 = await state(page);
  expect(s0.status).toBe("idle");
  await page.waitForTimeout(500);
  const s1 = await state(page);
  expect(s1.status).toBe("idle");
  expect(s1.tick).toBe(0); // no logic ran while waiting on the Start screen
  await start(page);
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(0);
});

test("TB-018: best score persists across a reload and shows on the Start screen", async ({ page }) => {
  await page.goto("/");
  // seed a stored best, then reload — a returning player must see it (AC-8)
  await page.evaluate(() => localStorage.setItem("twobirds.bestScore.v1", "137"));
  await page.reload();
  await expect(page.locator("#game")).toBeVisible();
  expect((await state(page)).status).toBe("idle");
  await expect.poll(() => page.evaluate(() => window.__twoBirds.getBest())).toBe(137);
});

test("TB-021/TB-018: a played new best flags New best!, persists across reload, and restart resets clean", async ({ page }) => {
  // fresh player (no stored best). Hands-off: the first object reaches the bird
  // ~tick 193, so a session always survives >1s → score > 0 → a genuine new record.
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await start(page);

  await expect.poll(() => status(page), { timeout: 15000 }).toBe("gameover");
  const played = await score(page);
  expect(played).toBeGreaterThan(0); // survived long enough to score from time
  expect(await isNewBest(page)).toBe(true); // AC-11 badge condition
  expect(await best(page)).toBe(played); // AC-8 written from real play, not hand-seeded

  // restart → clean state, best preserved, New best! cleared (AC-11)
  await page.keyboard.press("Space");
  await expect.poll(() => status(page)).toBe("running");
  expect(await score(page)).toBe(0);
  expect(await isNewBest(page)).toBe(false);
  expect(await best(page)).toBe(played);

  // and the played best survives a full reload (real write path persisted)
  await page.reload();
  await expect.poll(() => status(page)).toBe("idle");
  expect(await best(page)).toBe(played);
});

test("TB-018/TB-021: a session below the record leaves best unchanged and does not flag New best!", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("twobirds.bestScore.v1", "999999"));
  await page.reload();
  await start(page);
  await expect.poll(() => status(page), { timeout: 15000 }).toBe("gameover");
  expect(await score(page)).toBeLessThan(999999); // a hands-off session never beats this
  expect(await isNewBest(page)).toBe(false);
  expect(await best(page)).toBe(999999); // untouched
});

test("TB-023: a full play→eat→crash cycle logs no console errors (SFX/juice safe)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await start(page); // click SFX + unlock
  await expect.poll(() => status(page), { timeout: 15000 }).toBe("gameover"); // eat blips + crash SFX/shake fire
  await page.keyboard.press("Space"); // restart click
  await expect.poll(() => status(page)).toBe("running");
  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("TB-024: no AudioContext is created before the first user gesture (autoplay-safe)", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__acCount = 0;
    const Orig = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Orig) {
      (window as any).AudioContext = class extends Orig {
        constructor(...a: unknown[]) { super(...(a as [])); (window as any).__acCount++; }
      };
    }
  });
  await page.goto("/");
  await expect(page.locator("#game")).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).__acCount)).toBe(0); // nothing before a gesture
  await page.keyboard.press("Space"); // first gesture → unlock()
  await expect.poll(() => page.evaluate(() => (window as any).__acCount)).toBeGreaterThan(0);
});

test("TB-025: mute toggle persists across reload", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => window.__twoBirds.isMuted())).toBe(false);
  await page.locator("#mute").click();
  await expect.poll(() => page.evaluate(() => window.__twoBirds.isMuted())).toBe(true);
  await page.reload();
  await expect(page.locator("#game")).toBeVisible();
  expect(await page.evaluate(() => window.__twoBirds.isMuted())).toBe(true); // remembered
  // the start-tap must not have leaked while toggling mute: still idle
  expect(await status(page)).toBe("idle");
});

test("TB-037: name input shows on the Start screen and hides once playing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#name")).toBeVisible();
  await start(page); // Space (name not focused) → running
  await expect(page.locator("#name")).toBeHidden();
});

test("TB-038: player name persists across reload and can be changed", async ({ page }) => {
  await page.goto("/");
  await page.fill("#name", "Bo");
  await page.reload();
  await expect(page.locator("#game")).toBeVisible();
  expect(await page.inputValue("#name")).toBe("Bo");
  await page.fill("#name", "Khanh");
  await page.reload();
  expect(await page.inputValue("#name")).toBe("Khanh"); // overwritten + persisted
});

test("TB-039: blank name plays as 'Khách' and shows at game over", async ({ page }) => {
  await page.goto("/"); // fresh context → no stored name
  expect(await page.inputValue("#name")).toBe("");
  await start(page);
  await expect.poll(() => status(page), { timeout: 15000 }).toBe("gameover");
  expect(await page.evaluate(() => window.__twoBirds.getName())).toBe("Khách");
});

test("TB-040: typing in the name field never starts or steers the game", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto("/");
  await page.locator("#name").click(); // focus the field
  await page.keyboard.type("Ad");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  expect(await status(page)).toBe("idle"); // still on the Start screen
  const s = await state(page);
  expect(s.birds).toEqual([0, 1]); // no lane switch leaked
  // a real start: tap the canvas away from the input
  await page.mouse.click(60, 120);
  await expect.poll(() => status(page)).toBe("running");
});
