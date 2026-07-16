/** Shell: fixed-timestep loop (60Hz logic) + rAF render, pause on blur/hidden
 * (Wave 1 AC-7), instant restart (Wave 1 AC-8). Also drives the Wave 2 Start/Game-Over
 * flow (AC-10/AC-11) and best-score persistence (AC-8/AC-9). All game rules live in
 * core/ — this file only wires.
 *
 * Input hygiene (review P1-1): the tap that restarts the game, and the click that
 * refocuses a blurred tab, must NOT leak into the new/resumed game as a lane
 * switch — pending flags are discarded on restart and on the first frame after
 * resume (`justResumed`). */
import { createSfx } from "./audio/sfx";
import { DEFAULT_CONFIG, validateConfig } from "./config";
import { initState, scoreOf, tick, type State } from "./core/game";
import { attachInputs } from "./input/adapters";
import { createBestScoreStore } from "./persistence/bestScore";
import { createPlayerNameStore, displayName } from "./persistence/playerName";
import { draw, makeLayout, type Hud, type Layout } from "./render/draw";
import { createJuice } from "./render/juice";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 5; // after a long stall, don't fast-forward to death

const cfg = validateConfig(DEFAULT_CONFIG);
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputs = attachInputs();
const bestScore = createBestScoreStore();
const sfx = createSfx();
const juice = createJuice();
const playerName = createPlayerNameStore();

// open on the Start screen (idle): the core does not tick until first input (AC-10)
let state: State = initState(Date.now() & 0xffffffff, cfg, "idle");
let layout: Layout;
let paused = false;
let justResumed = false;
let newBest = false; // set when the last game-over beat the stored best (AC-11)
let prevBySide: [number, number] = [0, 0]; // per-side eat detection (SFX + particles) — render-only
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
  prevBySide = [0, 0];
  acc = 0;
  juice.clear();
  sfx.play("click");
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
  sfx.unlock(); // first user gesture unlocks audio (AC-2 autoplay policy)
  if (!e.repeat && state.status !== "running") startRun();
});
window.addEventListener("pointerdown", () => {
  sfx.unlock();
  if (state.status !== "running") startRun();
});

// Mute toggle (AC-3) — DOM button; stopPropagation so tapping it never starts/steers a game.
const muteBtn = document.getElementById("mute");
function paintMute(): void {
  if (muteBtn) muteBtn.textContent = sfx.muted() ? "🔇" : "🔊";
}
paintMute();
muteBtn?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  sfx.unlock();
  sfx.toggleMute();
  paintMute();
});

// Name input (Leaderboard W1) — visible only on the Start screen. stopPropagation so
// typing/tapping the field never starts or steers the game (AC-8). Shown/hidden by status.
const nameInput = document.getElementById("name") as HTMLInputElement | null;
if (nameInput) {
  nameInput.value = playerName.get();
  nameInput.addEventListener("keydown", (e) => e.stopPropagation());
  nameInput.addEventListener("pointerdown", (e) => e.stopPropagation());
  nameInput.addEventListener("input", () => playerName.set(nameInput.value));
  nameInput.addEventListener("blur", () => { nameInput.value = playerName.get(); }); // reflect sanitized
}

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
    // eat feedback attributed to the bird that actually ate (core tracks per side) —
    // RENDER-ONLY, derived from State, never fed back into core. Fires even on the
    // fatal tick (a seed eaten as the game ends still gets its blip).
    let ate = false;
    for (const side of [0, 1] as const) {
      if (state.seedsEatenBySide[side] > prevBySide[side]) {
        ate = true;
        juice.burstEat(layout.laneX(side, state.birds[side]), layout.y(cfg.birdY));
      }
    }
    if (ate) sfx.play("eat");
    prevBySide = [...state.seedsEatenBySide];

    // record best + crash feedback exactly once on the running → game-over edge (AC-8/AC-11)
    if (wasRunning && state.status === "gameover") {
      newBest = bestScore.submit(scoreOf(state, cfg));
      sfx.play(state.gameoverReason === "seed-missed" ? "miss" : "crash");
      juice.kick(14);
      juice.flash(state.gameoverReason === "seed-missed" ? "#b13e53" : "#ffffff");
    }
    // Drop the backlog ONLY when the cap was hit with work still pending
    // (death-spiral guard); a legitimate exactly-5-tick frame keeps its
    // sub-tick remainder so the game never drifts slow (review P2-2).
    if (steps === MAX_CATCHUP_TICKS && acc >= TICK_MS) acc = 0;
  }
  last = now;
  // name input is only for the Start screen (idle) — hide once a game is on
  if (nameInput) nameInput.style.display = state.status === "idle" ? "" : "none";
  const hud: Hud = {
    score: scoreOf(state, cfg),
    best: bestScore.get(),
    newBest,
    name: displayName(playerName.get()),
  };
  if (!paused) juice.step(); // freeze particles/shake while paused (N3)
  const sh = paused ? { x: 0, y: 0 } : juice.shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);
  draw(ctx, state, cfg, layout, paused, hud);
  juice.drawParticles(ctx);
  ctx.restore();
  juice.drawFlash(ctx, layout.width, layout.height);
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
  isMuted: () => sfx.muted(),
  getName: () => displayName(playerName.get()),
};
