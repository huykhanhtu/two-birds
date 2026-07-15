/** Input adapters: DOM events → per-tick lane-switch flags for the pure core.
 * Flags accumulate between ticks and are consumed once per tick (AC-1).
 * Pointer input is WINDOW-wide split by viewport halves — the spec says
 * "chạm nửa trái/phải MÀN HÌNH", so gutters outside the canvas must work too. */
import type { Inputs } from "../core/game";

export interface InputCollector {
  /** returns the pending inputs and clears them (called once per logic tick) */
  drain(): Inputs;
  dispose(): void;
}

export function attachInputs(): InputCollector {
  let left = false;
  let right = false;

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") left = true;
    if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") right = true;
  };
  const onPointer = (e: PointerEvent) => {
    if (e.clientX < window.innerWidth / 2) left = true;
    else right = true;
  };

  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", onPointer);

  return {
    drain() {
      const out: Inputs = { left, right };
      left = false;
      right = false;
      return out;
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    },
  };
}
