/** Canvas 2D renderer — reads State, never mutates it. Placeholder shapes (Wave 3 = sprites). */
import type { GameConfig } from "../config";
import type { Lane, Side, State } from "../core/game";

const COLORS = {
  bg: "#1a1c2c",
  divider: "#5d275d",
  lane: "#29366f",
  birdLeft: "#ef7d57",
  birdRight: "#41a6f6",
  pole: "#94b0c2",
  poleCap: "#566c86",
  seed: "#ffcd75",
  text: "#f4f4f4",
};

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
                     l: Layout, paused: boolean): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, l.width, l.height);

  // lane guides + center divider
  ctx.strokeStyle = COLORS.lane;
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    if (i === 2) continue;
    ctx.beginPath();
    ctx.moveTo((l.width / 4) * i, 0);
    ctx.lineTo((l.width / 4) * i, l.height);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(l.width / 2 - 3, 0, 6, l.height);

  const objH = cfg.objHalf * 2 * l.scale;
  const objW = Math.min(l.width / 4 - 16, objH * 1.2);

  for (const o of s.objects) {
    const x = l.laneX(o.side, o.lane);
    const y = l.y(o.y);
    if (o.kind === "pole") {
      ctx.fillStyle = COLORS.pole;
      ctx.fillRect(x - objW / 2, y - objH / 2, objW, objH);
      ctx.fillStyle = COLORS.poleCap;
      ctx.fillRect(x - objW / 2 - 4, y - objH / 2, objW + 8, objH * 0.2);
    } else {
      ctx.fillStyle = COLORS.seed;
      ctx.beginPath();
      ctx.arc(x, y, objH * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // birds — triangles pointing up
  const birdH = cfg.birdHalf * 2 * l.scale;
  ([0, 1] as const).forEach((side) => {
    const x = l.laneX(side, s.birds[side]);
    const y = l.y(cfg.birdY);
    ctx.fillStyle = side === 0 ? COLORS.birdLeft : COLORS.birdRight;
    ctx.beginPath();
    ctx.moveTo(x, y - birdH / 2);
    ctx.lineTo(x - birdH / 2, y + birdH / 2);
    ctx.lineTo(x + birdH / 2, y + birdH / 2);
    ctx.closePath();
    ctx.fill();
  });

  if (s.status === "gameover" || paused) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(l.width / 14)}px system-ui, sans-serif`;
    if (paused) {
      ctx.fillText("Tạm dừng", l.width / 2, l.height / 2);
    } else {
      const why = s.gameoverReason === "seed-missed" ? "Lỡ mất hạt thóc!" : "Đâm cột điện!";
      ctx.fillText("Game Over", l.width / 2, l.height / 2 - 30);
      ctx.font = `${Math.round(l.width / 24)}px system-ui, sans-serif`;
      ctx.fillText(why, l.width / 2, l.height / 2 + 14);
      ctx.fillText("Chạm / Space để chơi lại", l.width / 2, l.height / 2 + 52);
    }
  }
}
