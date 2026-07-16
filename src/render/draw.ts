/** Canvas 2D renderer — reads State, never mutates it. Hand-drawn shapes (no assets,
 * zero deps — ADR-0007). Wave 3 may swap these for sprites. */
import type { GameConfig } from "../config";
import type { Lane, Side, State } from "../core/game";

const COLORS = {
  // sky (background) — top → horizon
  skyTop: "#2f5d94", skyMid: "#5b93cf", skyBot: "#c7e6fa",
  // birds
  birdLbody: "#ef7d57", birdLwing: "#b13e53", birdLbelly: "#ffcd75",
  birdRbody: "#41a6f6", birdRwing: "#3b5dc9", birdRbelly: "#73eff7",
  beak: "#ffcd75", eye: "#f4f4f4", pupil: "#1a1c2c", outline: "rgba(26,28,44,0.35)",
  // objects
  pole: "#566c86", poleDark: "#333c57", poleEdge: "#94b0c2", bolt: "#ffcd75",
  seed: "#ffcd75", seedHi: "#fff6d5", seedShade: "#ef7d57", sprout: "#a7f070",
  // text
  text: "#f4f4f4", muted: "#94b0c2", best: "#ffcd75", newBest: "#a7f070",
};

/** Live HUD numbers the shell computes from state (score/best are UI, not core state). */
export interface Hud {
  score: number;
  best: number;
  /** true when the just-ended session beat the stored best (game-over only) */
  newBest: boolean;
}

export interface Layout {
  width: number;
  height: number;
  /** x center in px of (side, lane) */
  laneX: (side: Side, lane: Lane) => number;
  /** field units → px */
  y: (units: number) => number;
  scale: number;
}

export function makeLayout(width: number, height: number, cfg: GameConfig): Layout {
  const laneW = width / 4;
  return {
    width,
    height,
    laneX: (side, lane) => laneW * (side * 2 + lane) + laneW / 2,
    y: (units) => (units / cfg.fieldHeight) * height,
    scale: height / cfg.fieldHeight,
  };
}

export function draw(ctx: CanvasRenderingContext2D, s: State, cfg: GameConfig,
                     l: Layout, paused: boolean, hud: Hud): void {
  drawPlayfield(ctx, l, s.tick);

  const objH = cfg.objHalf * 2 * l.scale;
  const objW = Math.min(l.width / 4 - 14, objH * 1.25);
  for (const o of s.objects) {
    const x = l.laneX(o.side, o.lane);
    const y = l.y(o.y);
    if (o.kind === "pole") drawPole(ctx, x, y, objW, objH);
    else drawSeed(ctx, x, y, objH * 0.46);
  }

  const birdR = cfg.birdHalf * l.scale;
  drawBird(ctx, l.laneX(0, s.birds[0]), l.y(cfg.birdY), birdR, s.tick, "L");
  drawBird(ctx, l.laneX(1, s.birds[1]), l.y(cfg.birdY), birdR, s.tick, "R");

  // live score HUD while playing (AC-1) — hidden under the idle/game-over overlays
  if (s.status === "running") {
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(l.width / 13)}px system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(String(hud.score), l.width / 2, Math.round(l.height * 0.09));
    ctx.fillStyle = COLORS.text;
    ctx.fillText(String(hud.score), l.width / 2, Math.round(l.height * 0.09));
  }

  if (s.status === "idle") {
    overlayBackdrop(ctx, l);
    // decorative pair of birds above the title
    drawBird(ctx, l.width / 2 - l.width * 0.13, l.height / 2 - l.height * 0.16, l.width * 0.05, 0, "L");
    drawBird(ctx, l.width / 2 + l.width * 0.13, l.height / 2 - l.height * 0.16, l.width * 0.05, 0, "R");
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(l.width / 10)}px system-ui, sans-serif`;
    ctx.fillText("Two Birds", l.width / 2, l.height / 2 - 40);
    ctx.font = `${Math.round(l.width / 26)}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.best;
    ctx.fillText(`Best: ${hud.best}`, l.width / 2, l.height / 2 + 8);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Chạm / Space để chơi", l.width / 2, l.height / 2 + 48);
    return;
  }

  if (paused) {
    overlayBackdrop(ctx, l);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(l.width / 14)}px system-ui, sans-serif`;
    ctx.fillText("Tạm dừng", l.width / 2, l.height / 2);
    return;
  }

  if (s.status === "gameover") {
    overlayBackdrop(ctx, l);
    const cx = l.width / 2;
    const why = s.gameoverReason === "seed-missed" ? "Lỡ mất hạt thóc!" : "Đâm cột điện!";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold ${Math.round(l.width / 14)}px system-ui, sans-serif`;
    ctx.fillText("Game Over", cx, l.height / 2 - 90);
    ctx.font = `${Math.round(l.width / 26)}px system-ui, sans-serif`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(why, cx, l.height / 2 - 50);

    ctx.fillStyle = COLORS.text;
    ctx.font = `bold ${Math.round(l.width / 11)}px system-ui, sans-serif`;
    ctx.fillText(String(hud.score), cx, l.height / 2 + 6);

    ctx.font = `${Math.round(l.width / 28)}px system-ui, sans-serif`;
    if (hud.newBest) {
      ctx.fillStyle = COLORS.newBest;
      ctx.fillText("★ New best! ★", cx, l.height / 2 + 44);
    } else {
      ctx.fillStyle = COLORS.best;
      ctx.fillText(`Best: ${hud.best}`, cx, l.height / 2 + 44);
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.round(l.width / 26)}px system-ui, sans-serif`;
    ctx.fillText("Chạm / Space để chơi lại", cx, l.height / 2 + 88);
  }
}

// ---------- playfield ----------

function drawPlayfield(ctx: CanvasRenderingContext2D, l: Layout, tick: number): void {
  // sky gradient — birds fly in the sky, not on a road
  const g = ctx.createLinearGradient(0, 0, 0, l.height);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.55, COLORS.skyMid);
  g.addColorStop(1, COLORS.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l.width, l.height);

  drawClouds(ctx, l, tick);

  // lane cues — subtle translucent white so lanes stay readable without looking like a road
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 14]);
  for (const i of [1, 3]) {
    ctx.beginPath();
    ctx.moveTo((l.width / 4) * i, 0);
    ctx.lineTo((l.width / 4) * i, l.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // soft center divider between the two birds' halves
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(l.width / 2 - 2, 0, 4, l.height);

  // faint side edges (the 2 boundary lines)
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, 0); ctx.lineTo(2, l.height);
  ctx.moveTo(l.width - 2, 0); ctx.lineTo(l.width - 2, l.height);
  ctx.stroke();
}

/** A few soft clouds drifting slowly across the sky (decor). */
function drawClouds(ctx: CanvasRenderingContext2D, l: Layout, tick: number): void {
  const clouds = [
    { x: 0.18, y: 0.12, s: 1.0 },
    { x: 0.72, y: 0.24, s: 1.35 },
    { x: 0.42, y: 0.44, s: 0.8 },
    { x: 0.83, y: 0.62, s: 1.1 },
    { x: 0.12, y: 0.76, s: 0.95 },
  ];
  const span = l.width + 220;
  const drift = (tick * 0.15) % span;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "#ffffff";
  for (const c of clouds) {
    const cx = ((c.x * l.width + drift) % span) - 110;
    puff(ctx, cx, c.y * l.height, 22 * c.s * (l.width / 480));
  }
  ctx.restore();
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.7, r, 0, 0, Math.PI * 2);
  ctx.ellipse(x - r, y + r * 0.25, r, r * 0.75, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r, y + r * 0.25, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- entities ----------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number,
                       w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Electricity pole = the hazard to avoid: steel body, dark cap, warning ⚡ bolt. */
function drawPole(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  // body
  roundRectPath(ctx, x, y, w, h, Math.min(8, w * 0.18));
  ctx.fillStyle = COLORS.pole;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.poleDark;
  ctx.stroke();
  // top cap (cross-arm feel)
  ctx.fillStyle = COLORS.poleDark;
  roundRectPath(ctx, x - w * 0.14, y, w * 1.28, h * 0.2, 3);
  ctx.fill();
  // lightning bolt (danger)
  const bx = cx, by = cy;
  const u = h * 0.16;
  ctx.fillStyle = COLORS.bolt;
  ctx.beginPath();
  ctx.moveTo(bx + u * 0.5, by - u * 1.4);
  ctx.lineTo(bx - u * 0.7, by + u * 0.2);
  ctx.lineTo(bx - u * 0.05, by + u * 0.2);
  ctx.lineTo(bx - u * 0.5, by + u * 1.4);
  ctx.lineTo(bx + u * 0.7, by - u * 0.2);
  ctx.lineTo(bx + u * 0.02, by - u * 0.2);
  ctx.closePath();
  ctx.fill();
}

/** Grain of seed = the collectible: golden teardrop, highlight + little green sprout. */
function drawSeed(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  // soft glow
  ctx.fillStyle = "rgba(255,205,117,0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  // teardrop body (pointed top)
  ctx.fillStyle = COLORS.seed;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.35);
  ctx.quadraticCurveTo(cx + r * 1.15, cy - r * 0.2, cx, cy + r * 1.15);
  ctx.quadraticCurveTo(cx - r * 1.15, cy - r * 0.2, cx, cy - r * 1.35);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLORS.seedShade;
  ctx.stroke();
  // highlight
  ctx.fillStyle = COLORS.seedHi;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.32, cy - r * 0.1, r * 0.22, r * 0.45, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // sprout
  ctx.strokeStyle = COLORS.sprout;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.25);
  ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 1.9, cx + r * 0.15, cy - r * 2.2);
  ctx.stroke();
}

/** A little bird facing up: body, belly, wing (flaps with tick), tail, beak, eye. */
function drawBird(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
                  tick: number, which: "L" | "R"): void {
  const body = which === "L" ? COLORS.birdLbody : COLORS.birdRbody;
  const wing = which === "L" ? COLORS.birdLwing : COLORS.birdRwing;
  const belly = which === "L" ? COLORS.birdLbelly : COLORS.birdRbelly;
  const flap = Math.sin(tick * 0.25) * r * 0.18;

  // tail (behind, bottom)
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.2);
  ctx.lineTo(cx - r * 0.5, cy + r * 1.15);
  ctx.lineTo(cx + r * 0.5, cy + r * 1.15);
  ctx.closePath();
  ctx.fill();

  // body (+ soft outline so the bird pops against the blue sky)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.8, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.strokeStyle = COLORS.outline;
  ctx.stroke();
  // belly
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.25, r * 0.5, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // wing (flaps)
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.55, cy - flap, r * 0.32, r * 0.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.55, cy - flap, r * 0.32, r * 0.6, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // beak (up)
  ctx.fillStyle = COLORS.beak;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.35);
  ctx.lineTo(cx - r * 0.22, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.22, cy - r * 0.85);
  ctx.closePath();
  ctx.fill();

  // eyes
  for (const dx of [-r * 0.3, r * 0.3]) {
    ctx.fillStyle = COLORS.eye;
    ctx.beginPath();
    ctx.arc(cx + dx, cy - r * 0.35, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(cx + dx, cy - r * 0.38, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function overlayBackdrop(ctx: CanvasRenderingContext2D, l: Layout): void {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, l.width, l.height);
}
