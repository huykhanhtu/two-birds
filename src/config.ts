/** Game tuning — every gameplay number lives here (AC-9), core has no magic numbers.
 * Units: logical field 1000 tall; 1 tick = 1/60s (fixed timestep, ADR-0008). */

export interface GameConfig {
  /** logical playfield height in units (width is lane-based, not continuous) */
  fieldHeight: number;
  /** bird center y in units */
  birdY: number;
  /** falling speed, units per tick */
  fallSpeed: number;
  /** minimum ticks between two spawns on the SAME side (fairness floor, AC-4) */
  minGapTicks: number;
  /** random extra ticks added to each gap (0..jitter) */
  gapJitterTicks: number;
  /** probability a spawned object is a pole (rest are seeds) */
  poleRatio: number;
  /** hitbox = visual size × shrink (AC-5); must be in (0, 1] */
  hitboxShrink: number;
  /** half-height of bird / falling object visuals, units */
  birdHalf: number;
  objHalf: number;
  /** greedy-player reaction time used by the fairness property test; must be < minGapTicks */
  reactionTicks: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  fieldHeight: 1000,
  birdY: 860,
  fallSpeed: 6,
  minGapTicks: 45, // 0.75s at 60Hz
  gapJitterTicks: 30,
  poleRatio: 0.6, // 60:40 pole:seed (spec, khanht 2026-07-15)
  hitboxShrink: 0.8,
  birdHalf: 28,
  objHalf: 28,
  reactionTicks: 20,
};

export class ConfigError extends Error {}

/** Fail loudly at startup — never run on silently-broken tuning (AC-9). */
export function validateConfig(c: GameConfig): GameConfig {
  const bad = (msg: string) => {
    throw new ConfigError(`invalid config: ${msg}`);
  };
  if (c.fieldHeight <= 0) bad("fieldHeight must be > 0");
  if (c.birdY <= 0 || c.birdY >= c.fieldHeight) bad("birdY must be inside the field");
  if (c.fallSpeed <= 0) bad("fallSpeed must be > 0");
  if (c.minGapTicks < 1) bad("minGapTicks must be >= 1");
  if (c.gapJitterTicks < 0) bad("gapJitterTicks must be >= 0");
  if (c.poleRatio < 0 || c.poleRatio > 1) bad("poleRatio must be within 0..1");
  if (c.hitboxShrink <= 0 || c.hitboxShrink > 1) bad("hitboxShrink must be in (0, 1]");
  if (c.birdHalf <= 0 || c.objHalf <= 0) bad("birdHalf/objHalf must be > 0");
  if (c.reactionTicks < 0) bad("reactionTicks must be >= 0");
  if (c.reactionTicks >= c.minGapTicks) bad("reactionTicks must be < minGapTicks (fairness)");
  return c;
}
