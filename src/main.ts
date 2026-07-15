/** Shell: fixed-timestep loop (60Hz logic) + rAF render, pause on blur/hidden
 * (Wave 1 AC-7), instant restart (Wave 1 AC-8). Also drives the Wave 2 Start/Game-Over
 * flow (AC-10/AC-11) and best-score persistence (AC-8/AC-9). All game rules live in
 * core/ — this file only wires.
 *
 * Input hygiene (review P1-1): the tap that restarts the game, and the click that
 * refocuses a blurred tab, must NOT leak into the new/resumed game as a lane
 * switch — pending flags are discarded on restart and on the first frame after
 * resume (`justResumed`). */
import { DEFAULT_CONFIG, validateConfig } from "./config";
import { initState, scoreOf, tick, type State } from "./core/game";
import { attachInputs } from "./input/adapters";
import { createBestScoreStore } from "./persistence/bestScore";
import { draw, makeLayout, type Hud, type Layout } from "./render/draw";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 5; // after a long stall, don't fast-forward to death

const cfg = validateConfig(DEFAULT_CONFIG);
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputs = attachInputs();
const bestScore = createBestScoreStore();

// open on the Start screen (idle): the core does not tick until first input (AC-10)
let state: State = initState(Date.now() & 0xffffffff, cfg, "idle");
let layout: Layout;
let paused = false;
let justResumed = false;
let newBest = false; // set when the last game-over beat the stored best (AC-11)
let acc = 0;
let last = performance.now();

function resize(): void {
  // portrait-ish playfield centered in the viewport (AC-10)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw, vh * 0.75);
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(vh * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${vh}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  layout = makeLayout(width, vh, cfg);
}

/** Begin a fresh run — used from both the Start screen (AC-10) and Game-Over restart
 * (AC-11; clean state carries nothing over, cf. Wave 1 AC-8). The tap/keypress that
 * starts a game must NOT leak into it as a lane switch. */
function startRun(): void {
  state = initState(Date.now() & 0xffffffff, cfg, "running");
  newBest = false;
  acc = 0;
  inputs.drain();
}

function pause(): void {
  paused = true;
}

function resume(): void {
  paused = false;
  last = performance.now(); // don't count blurred time into the accumulator
  justResumed = true; // discard any input that arrived with the refocus click (AC-7)
}

window.addEventListener("resize", resize);
window.addEventListener("blur", pause);
window.addEventListener("focus", resume);
// iOS Safari app-switch fires visibilitychange without blur/focus
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  else resume();
});
// Any input while NOT running starts a fresh game — from the Start screen (idle)
// and from Game-Over (AC-8/10/11). While running these keys/taps are lane switches
// handled by the input adapter; here we only gate the start/restart transition.
window.addEventListener("keydown", (e) => {
  if (!e.repeat && state.status !== "running") startRun();
});
window.addEventListener("pointerdown", () => {
  if (state.status !== "running") startRun();
});

function frame(now: number): void {
  if (justResumed) {
    inputs.drain();
    justResumed = false;
  }
  if (!paused) {
    acc += now - last;
    let steps = 0;
    const wasRunning = state.status === "running";
    while (acc >= TICK_MS && steps < MAX_CATCHUP_TICKS) {
      state = tick(state, inputs.drain(), cfg);
      acc -= TICK_MS;
      steps += 1;
    }
    // record best exactly once on the running → game-over edge (AC-8/AC-11)
    if (wasRunning && state.status === "gameover") {
      newBest = bestScore.submit(scoreOf(state, cfg));
    }
    // Drop the backlog ONLY when the cap was hit with work still pending
    // (death-spiral guard); a legitimate exactly-5-tick frame keeps its
    // sub-tick remainder so the game never drifts slow (review P2-2).
    if (steps === MAX_CATCHUP_TICKS && acc >= TICK_MS) acc = 0;
  }
  last = now;
  const hud: Hud = { score: scoreOf(state, cfg), best: bestScore.get(), newBest };
  draw(ctx, state, cfg, layout, paused, hud);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);

// Read-only hooks for e2e tests (Playwright) — never used by game logic.
(window as unknown as Record<string, unknown>).__twoBirds = {
  getState: () => state,
  isPaused: () => paused,
  getScore: () => scoreOf(state, cfg),
  getBest: () => bestScore.get(),
  isNewBest: () => newBest,
};
