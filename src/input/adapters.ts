/** Input adapters: DOM events → per-tick lane-switch flags for the pure core.
 * Flags accumulate between ticks and are consumed once per tick (AC-1). */
import type { Inputs } from "../core/game";

export interface InputCollector {
  /** returns the pending inputs and clears them (called once per logic tick) */
  drain(): Inputs;
  dispose(): void;
}

export function attachInputs(canvas: HTMLCanvasElement): InputCollector {
  let left = false;
  let right = false;

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") left = true;
    if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") right = true;
  };
  const onPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) left = true;
    else right = true;
    e.preventDefault();
  };

  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);

  return {
    drain() {
      const out: Inputs = { left, right };
      left = false;
      right = false;
      return out;
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointer);
    },
  };
}
