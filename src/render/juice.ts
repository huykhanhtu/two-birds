/** Juice: particles + screen-shake + flash (AC-4). RENDER-ONLY — never imported by
 * core/, so it may use Math.random freely without touching gameplay determinism.
 * Everything here is ephemeral eye-candy; disabling it must not change any State. */

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string;
}

export interface JuiceConfig {
  enabled: boolean;
  eatParticles: number;
  shakeDecay: number; // px removed per frame
  gravity: number;
}

export const DEFAULT_JUICE: JuiceConfig = {
  enabled: true,
  eatParticles: 7,
  shakeDecay: 0.9,
  gravity: 0.35,
};

export interface Juice {
  burstEat(x: number, y: number): void;
  kick(magnitude: number): void;
  flash(color: string): void;
  /** advance one frame */
  step(): void;
  shakeOffset(): { x: number; y: number };
  drawParticles(ctx: CanvasRenderingContext2D): void;
  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  clear(): void;
}

const GOLD = ["#ffcd75", "#fff6d5", "#ef7d57"];

export function createJuice(cfg: JuiceConfig = DEFAULT_JUICE): Juice {
  let particles: Particle[] = [];
  let shake = 0;
  let flashA = 0;
  let flashColor = "#ffffff";

  return {
    burstEat(x, y) {
      if (!cfg.enabled) return;
      for (let i = 0; i < cfg.eatParticles; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 3;
        particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2,
          life: 0, max: 24 + Math.random() * 12,
          r: 2 + Math.random() * 3,
          color: GOLD[(Math.random() * GOLD.length) | 0],
        });
      }
    },
    kick(magnitude) {
      if (!cfg.enabled) return;
      shake = Math.max(shake, magnitude);
    },
    flash(color) {
      if (!cfg.enabled) return;
      flashColor = color;
      flashA = 0.5;
    },
    step() {
      particles = particles.filter((p) => p.life < p.max);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += cfg.gravity; p.life += 1;
      }
      if (shake > 0) shake = Math.max(0, shake - cfg.shakeDecay);
      if (flashA > 0) flashA = Math.max(0, flashA - 0.04);
    },
    shakeOffset() {
      if (shake <= 0) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * shake * 2, y: (Math.random() - 0.5) * shake * 2 };
    },
    drawParticles(ctx) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    drawFlash(ctx, w, h) {
      if (flashA <= 0) return;
      ctx.globalAlpha = flashA;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
    clear() {
      particles = [];
      shake = 0;
      flashA = 0;
    },
  };
}
