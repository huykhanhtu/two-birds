/** Shell: fixed-timestep loop (60Hz logic) + rAF render, pause on blur (AC-7),
 * instant restart (AC-8). All game rules live in core/ — this file only wires. */
import { DEFAULT_CONFIG, validateConfig } from "./config";
import { initState, tick, type State } from "./core/game";
import { attachInputs } from "./input/adapters";
import { draw, makeLayout, type Layout } from "./render/draw";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 5; // after a long stall, don't fast-forward to death

const cfg = validateConfig(DEFAULT_CONFIG);
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputs = attachInputs(canvas);

let state: State = initState(Date.now() & 0xffffffff, cfg);
let layout: Layout;
let paused = false;
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

function restart(): void {
  state = initState(Date.now() & 0xffffffff, cfg);
  acc = 0;
}

window.addEventListener("resize", resize);
window.addEventListener("blur", () => (paused = true));
window.addEventListener("focus", () => {
  paused = false;
  last = performance.now(); // don't count blurred time into the accumulator
});
window.addEventListener("keydown", (e) => {
  if (e.key === " " && state.status === "gameover") restart();
});
canvas.addEventListener("pointerdown", () => {
  if (state.status === "gameover") restart();
});

function frame(now: number): void {
  if (!paused) {
    acc += now - last;
    let steps = 0;
    while (acc >= TICK_MS && steps < MAX_CATCHUP_TICKS) {
      state = tick(state, inputs.drain(), cfg);
      acc -= TICK_MS;
      steps += 1;
    }
    if (steps === MAX_CATCHUP_TICKS) acc = 0;
  }
  last = now;
  draw(ctx, state, cfg, layout, paused);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);

// Read-only hooks for e2e tests (Playwright) — never used by game logic.
(window as unknown as Record<string, unknown>).__twoBirds = {
  getState: () => state,
  isPaused: () => paused,
};
