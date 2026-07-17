/** Pure game core (ADR-0008): tick(state, inputs, config) → new state.
 * No DOM, no wall-clock, no ambient randomness — the RNG state lives inside State.
 * Per-tick order (deterministic): read difficulty → inputs → move → collide → spawn. */
import {
  difficultyT,
  effectiveFallSpeed,
  effectiveMinGap,
  type GameConfig,
} from "../config";
import { nextRand, seedRng } from "./rng";

export type Side = 0 | 1; // 0 = left half, 1 = right half
export type Lane = 0 | 1; // two lanes per side (spec)
/** "flip" = rare invert power-up: eating it toggles State.inverted (invert-powerup). */
export type ObjectKind = "pole" | "seed" | "flip";

export interface FallingObject {
  id: number;
  side: Side;
  lane: Lane;
  kind: ObjectKind;
  /** center y in field units; spawns above the screen at -objHalf */
  y: number;
}

export interface Inputs {
  /** lane-switch request for that side, applied this tick (AC-1) */
  left?: boolean;
  right?: boolean;
}

export interface State {
  /** idle = màn Start chờ input đầu (không tick); running; gameover (AC-10/AC-11) */
  status: "idle" | "running" | "gameover";
  tick: number;
  /** current lane of each bird, indexed by Side */
  birds: [Lane, Lane];
  objects: FallingObject[];
  /** next spawn tick per side */
  nextSpawn: [number, number];
  rng: number;
  nextId: number;
  seedsEaten: number;
  /** seeds eaten per side (deterministic; lets the render layer attribute the eat
   * feedback to the correct bird without knowing which one ate) */
  seedsEatenBySide: [number, number];
  /** invert-powerup: when true the field is vertically mirrored — birds fly at the
   * TOP row (fieldHeight − birdY) and objects rise from the bottom. A pure vertical
   * reflection (spawn stream unchanged), so a solvable field stays solvable (AC-4/7).
   * Toggled by eating a `flip`. Part of State ⇒ core stays pure & deterministic (AC-6). */
  inverted: boolean;
  /** what ended the game (render shows it; Wave 2 uses it for stats) */
  gameoverReason?: "pole-hit" | "seed-missed";
}

/** The bird's effective collision/render row for the current orientation (AC-4).
 * Normal = birdY (near the bottom); inverted = its vertical mirror (near the top). */
export function birdRowOf(cfg: GameConfig, inverted: boolean): number {
  return inverted ? cfg.fieldHeight - cfg.birdY : cfg.birdY;
}

/** True once an object has fully cleared the far edge it travels toward and should
 * despawn (bottom when normal, top when inverted). For seeds this is the "miss". */
function pastFarEdge(y: number, cfg: GameConfig, inverted: boolean): boolean {
  return inverted ? y + cfg.objHalf < 0 : y - cfg.objHalf > cfg.fieldHeight;
}

export function initState(
  seed: number,
  cfg: GameConfig,
  status: State["status"] = "running",
): State {
  // first spawns stagger the two sides so play never opens with a double decision
  return {
    status,
    tick: 0,
    birds: [0, 1],
    objects: [],
    nextSpawn: [cfg.minGapTicks, cfg.minGapTicks + Math.floor(cfg.minGapTicks / 2)],
    rng: seedRng(seed),
    nextId: 1,
    seedsEaten: 0,
    seedsEatenBySide: [0, 0],
    inverted: false, // always opens right-side-up; flips toggle it during play (AC-9)
  };
}

/** Score = seeds eaten × seedPoints + survived seconds × timePoints (AC-1).
 * Pure function of state — frozen automatically once the game stops ticking (AC-2). */
export function scoreOf(s: State, cfg: GameConfig): number {
  return (
    s.seedsEaten * cfg.seedPoints +
    Math.floor(s.tick / cfg.ticksPerSecond) * cfg.timePoints
  );
}

function collides(objY: number, birdY: number, cfg: GameConfig): boolean {
  const reach = (cfg.birdHalf + cfg.objHalf) * cfg.hitboxShrink; // AC-5
  return Math.abs(objY - birdY) < reach;
}

export function tick(s: State, inputs: Inputs, cfg: GameConfig): State {
  if (s.status !== "running") return s;

  // 0) difficulty for THIS tick — a pure function of the incoming score (AC-4/7).
  // Read from `s` (before this tick's changes) so it stays deterministic and the
  // spawn gap below is chosen with the same t used for movement.
  const t = difficultyT(scoreOf(s, cfg), cfg);
  const fallSpeed = effectiveFallSpeed(cfg, t);

  // 1) inputs — both sides may switch in the same tick, independently (AC-1)
  const birds: [Lane, Lane] = [
    inputs.left ? ((1 - s.birds[0]) as Lane) : s.birds[0],
    inputs.right ? ((1 - s.birds[1]) as Lane) : s.birds[1],
  ];

  // 2) move — objects travel DOWN normally, UP when inverted (AC-4). Everything below
  // is evaluated in the CURRENT orientation (s.inverted); any toggle applies afterward.
  const dir = s.inverted ? -1 : 1;
  let objects = s.objects.map((o) => ({ ...o, y: o.y + dir * fallSpeed }));
  const birdRow = birdRowOf(cfg, s.inverted);

  // 3) collide / eat / miss (AC-2, AC-3). Process EVERY object even after a
  // fatal event so the frozen game-over frame shows post-move positions, the
  // fatal object itself, and every seed eaten this tick (review P2-1).
  let seedsEaten = s.seedsEaten;
  const seedsBySide: [number, number] = [...s.seedsEatenBySide];
  let gameoverReason: State["gameoverReason"];
  let flipsEaten = 0; // invert-powerup: flips consumed this tick (AC-3)
  const remaining: FallingObject[] = [];
  for (const o of objects) {
    const onBird = o.lane === birds[o.side] && collides(o.y, birdRow, cfg);
    if (o.kind === "pole") {
      if (onBird) {
        gameoverReason = gameoverReason ?? "pole-hit";
        remaining.push(o); // keep the killer visible in the frozen frame
      } else if (!pastFarEdge(o.y, cfg, s.inverted)) {
        remaining.push(o); // poles that clear the far edge simply despawn
      }
    } else if (o.kind === "seed") {
      if (onBird) {
        seedsEaten += 1; // eaten — gone
        seedsBySide[o.side] += 1;
      } else if (pastFarEdge(o.y, cfg, s.inverted)) {
        gameoverReason = gameoverReason ?? "seed-missed";
        remaining.push(o);
      } else {
        remaining.push(o);
      }
    } else {
      // "flip" — optional power-up. Eating it toggles inversion; a missed flip clears
      // the far edge and despawns harmlessly — never a game over (AC-2).
      if (onBird) flipsEaten += 1; // eaten — gone
      else if (!pastFarEdge(o.y, cfg, s.inverted)) remaining.push(o);
    }
  }
  objects = remaining;
  if (gameoverReason) {
    return {
      ...s, status: "gameover", tick: s.tick + 1, birds, objects,
      seedsEaten, seedsEatenBySide: seedsBySide, gameoverReason,
    };
  }

  // 3b) apply the invert toggle from flips eaten this tick (AC-3/AC-4). An odd count
  // flips orientation; two flips in one tick cancel (parity). Toggling MIRRORS every
  // in-flight object vertically (khanht: mirror tức thời) — a pure reflection that
  // preserves each object's lane and its remaining distance to the bird, so the field
  // stays exactly as solvable as before (proven by the property test TB-047).
  let inverted = s.inverted;
  if (flipsEaten % 2 === 1) {
    inverted = !inverted;
    objects = objects.map((o) => ({ ...o, y: cfg.fieldHeight - o.y }));
  }

  // 4) spawn — per side, gap-constrained rows (AC-4 fairness floor). Objects enter from
  // the edge opposite their travel: top when normal, bottom when inverted. The RNG draws
  // (lane, kind, gap) are unchanged by orientation ⇒ identical spawn stream (AC-7).
  let rng = s.rng;
  let nextId = s.nextId;
  const nextSpawn: [number, number] = [...s.nextSpawn];
  const newTick = s.tick + 1;
  const spawnY = inverted ? cfg.fieldHeight + cfg.objHalf : -cfg.objHalf;
  for (const side of [0, 1] as const) {
    if (newTick >= nextSpawn[side]) {
      let r: number;
      [r, rng] = nextRand(rng);
      const lane: Lane = r < 0.5 ? 0 : 1;
      [r, rng] = nextRand(rng);
      // three-way split: pole | flip | seed. flipRatio is carved out of the seed share,
      // so flipRatio=0 reproduces the exact Wave 1-3 pole/seed stream (AC-9).
      const kind: ObjectKind =
        r < cfg.poleRatio ? "pole" : r < cfg.poleRatio + cfg.flipRatio ? "flip" : "seed";
      objects = [...objects, { id: nextId++, side, lane, kind, y: spawnY }];
      [r, rng] = nextRand(rng);
      // gap shrinks with difficulty (denser) but never below the fairness floor,
      // enforced structurally by validateConfig across all t (AC-6). Jitter only adds.
      nextSpawn[side] = newTick + effectiveMinGap(cfg, t) + Math.floor(r * cfg.gapJitterTicks);
    }
  }

  return {
    status: "running",
    tick: newTick,
    birds,
    objects,
    nextSpawn,
    rng,
    nextId,
    seedsEaten,
    seedsEatenBySide: seedsBySide,
    inverted,
  };
}
