/** Game tuning — every gameplay number lives here (AC-9/AC-12), core has no magic numbers.
 * Units: logical field 1000 tall; 1 tick = 1/60s (fixed timestep, ADR-0008). */

export interface GameConfig {
  /** logical playfield height in units (width is lane-based, not continuous) */
  fieldHeight: number;
  /** bird center y in units */
  birdY: number;
  /** falling speed at difficulty t=0, units per tick */
  fallSpeed: number;
  /** minimum ticks between two spawns on the SAME side at t=0 (fairness floor, AC-4) */
  minGapTicks: number;
  /** random extra ticks added to each gap (0..jitter); only ever INCREASES gap, so safe */
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

  // --- Wave 2: scoring (AC-1) ---
  /** points awarded per seed eaten */
  seedPoints: number;
  /** points awarded per survived second */
  timePoints: number;
  /** ticks per second (score's time term uses this; fixed-timestep = 60) */
  ticksPerSecond: number;

  // --- Wave 2: difficulty ramp (AC-4/5/6) ---
  /** master switch; when false the game runs at t=0 tuning forever (Wave 1 behavior) */
  rampEnabled: boolean;
  /** score at which difficulty reaches the cap (t=1); above this, t stays 1 */
  scoreToMax: number;
  /** falling speed at the cap (t=1); must be >= fallSpeed */
  fallSpeedCap: number;
  /** same-side spawn gap at the cap (t=1); interpolates down from minGapTicks */
  gapCapTicks: number;
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

  // scoring — seeds trội, thời gian phụ (khanht 2026-07-15)
  seedPoints: 10,
  timePoints: 1,
  ticksPerSecond: 60,

  // ramp — liên tục theo điểm, cap 2× (khanht 2026-07-15)
  rampEnabled: true,
  scoreToMax: 250,
  fallSpeedCap: 12, // 2× fallSpeed
  gapCapTicks: 32, // > collision-transit(cap) + reaction = 8 + 20 = 28, để dư biên
};

export class ConfigError extends Error {}

/** Ticks a falling object at `speed` spends inside the collision zone at the bird's row. */
export function collisionWindowAtSpeed(c: GameConfig, speed: number): number {
  return Math.ceil((2 * (c.birdHalf + c.objHalf) * c.hitboxShrink) / speed);
}

/** Back-compat: collision transit at the base (t=0) speed. */
export function collisionWindowTicks(c: GameConfig): number {
  return collisionWindowAtSpeed(c, c.fallSpeed);
}

/** Difficulty progress in [0,1] from the running score (AC-4, driver = điểm). */
export function difficultyT(score: number, c: GameConfig): number {
  if (!c.rampEnabled || c.scoreToMax <= 0) return 0;
  const t = score / c.scoreToMax;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Falling speed at difficulty t — continuous (linear) interpolation base→cap (AC-4/5). */
export function effectiveFallSpeed(c: GameConfig, t: number): number {
  return c.fallSpeed + t * (c.fallSpeedCap - c.fallSpeed);
}

/** Same-side spawn gap at difficulty t — shrinks continuously minGapTicks→gapCapTicks.
 * Validated (below) to never drop under the fairness floor at any t (AC-6). */
export function effectiveMinGap(c: GameConfig, t: number): number {
  return Math.round(c.minGapTicks + t * (c.gapCapTicks - c.minGapTicks));
}

/** Fairness floor at difficulty t: gap must cover the collision transit (at that
 * speed) plus the player's reaction budget. Faster speed → shorter transit → the
 * floor relaxes, which is exactly why shrinking the gap can stay solvable. */
export function fairnessFloorAt(c: GameConfig, t: number): number {
  return collisionWindowAtSpeed(c, effectiveFallSpeed(c, t)) + c.reactionTicks;
}

/** Fail loudly at startup — never run on silently-broken tuning (AC-9/AC-12). */
export function validateConfig(c: GameConfig): GameConfig {
  const bad = (msg: string) => {
    throw new ConfigError(`invalid config: ${msg}`);
  };
  for (const [key, value] of Object.entries(c)) {
    if (key === "rampEnabled") {
      if (typeof value !== "boolean") bad("rampEnabled must be a boolean");
      continue;
    }
    // NaN/Infinity slip through every comparison guard (NaN <= 0 is false) — reject first
    if (typeof value !== "number" || !Number.isFinite(value)) bad(`${key} must be a finite number`);
  }
  if (c.fieldHeight <= 0) bad("fieldHeight must be > 0");
  if (c.birdY <= 0 || c.birdY >= c.fieldHeight) bad("birdY must be inside the field");
  if (c.fallSpeed <= 0) bad("fallSpeed must be > 0");
  if (c.minGapTicks < 1) bad("minGapTicks must be >= 1");
  if (c.gapJitterTicks < 0) bad("gapJitterTicks must be >= 0");
  if (c.poleRatio < 0 || c.poleRatio > 1) bad("poleRatio must be within 0..1");
  if (c.hitboxShrink <= 0 || c.hitboxShrink > 1) bad("hitboxShrink must be in (0, 1]");
  if (c.birdHalf <= 0 || c.objHalf <= 0) bad("birdHalf/objHalf must be > 0");
  if (c.reactionTicks < 0) bad("reactionTicks must be >= 0");

  // Scoring (AC-1)
  if (c.seedPoints <= 0) bad("seedPoints must be > 0");
  if (c.timePoints < 0) bad("timePoints must be >= 0");
  if (c.ticksPerSecond < 1) bad("ticksPerSecond must be >= 1");

  // Ramp (AC-5/AC-12)
  if (c.scoreToMax <= 0) bad("scoreToMax must be > 0");
  if (c.gapCapTicks < 1) bad("gapCapTicks must be >= 1");
  if (c.fallSpeedCap < c.fallSpeed) bad("fallSpeedCap must be >= fallSpeed");

  // Fairness (the spec's strongest BR): between two same-side objects the player
  // must be able to WAIT OUT the first object's collision transit and still have
  // reaction time before the next arrives (review P1-2). Wave 2 makes this hold at
  // EVERY difficulty t, not just t=0 — the ramp shrinks the gap and raises the
  // speed together, so we scan the whole [0,1] range and reject any t where the
  // interpolated gap would drop under the fairness floor (AC-6/AC-12).
  //
  // This scan reasons about the INSTANTANEOUS gap at each t. Because the ramp also
  // accelerates already-airborne objects, real arrival-time gaps compress slightly
  // vs the spawn-tick gap; that second-order effect is absorbed by the reactionTicks
  // margin and — crucially — the *true* end-to-end solvability guarantee is the
  // greedy-player property test (ramp.test.ts TB-016), which runs the actual game
  // across the full ramp to the cap. This check is the cheap, fail-loud first line.
  const tSamples = c.rampEnabled ? 51 : 1; // dense scan; convex floor + linear gap → sampling is safe
  for (let i = 0; i < tSamples; i++) {
    const t = tSamples === 1 ? 0 : i / (tSamples - 1);
    const gap = effectiveMinGap(c, t);
    const floor = fairnessFloorAt(c, t);
    if (gap < floor) {
      const speed = effectiveFallSpeed(c, t).toFixed(2);
      bad(`spawn gap (${gap}) at difficulty t=${t.toFixed(2)} (fallSpeed ${speed}) is below ` +
          `the fairness floor (${floor} = collision transit + reactionTicks) — ` +
          `unsolvable spawn patterns would exist`);
    }
  }
  return c;
}
