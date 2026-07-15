/** Pure game core (ADR-0008): tick(state, inputs, config) → new state.
 * No DOM, no wall-clock, no ambient randomness — the RNG state lives inside State.
 * Per-tick order (deterministic): inputs → move → collide → spawn. */
import type { GameConfig } from "../config";
import { nextRand, seedRng } from "./rng";

export type Side = 0 | 1; // 0 = left half, 1 = right half
export type Lane = 0 | 1; // two lanes per side (spec)
export type ObjectKind = "pole" | "seed";

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
  status: "running" | "gameover";
  tick: number;
  /** current lane of each bird, indexed by Side */
  birds: [Lane, Lane];
  objects: FallingObject[];
  /** next spawn tick per side */
  nextSpawn: [number, number];
  rng: number;
  nextId: number;
  seedsEaten: number;
  /** what ended the game (render shows it; Wave 2 uses it for stats) */
  gameoverReason?: "pole-hit" | "seed-missed";
}

export function initState(seed: number, cfg: GameConfig): State {
  // first spawns stagger the two sides so play never opens with a double decision
  return {
    status: "running",
    tick: 0,
    birds: [0, 1],
    objects: [],
    nextSpawn: [cfg.minGapTicks, cfg.minGapTicks + Math.floor(cfg.minGapTicks / 2)],
    rng: seedRng(seed),
    nextId: 1,
    seedsEaten: 0,
  };
}

function collides(objY: number, birdY: number, cfg: GameConfig): boolean {
  const reach = (cfg.birdHalf + cfg.objHalf) * cfg.hitboxShrink; // AC-5
  return Math.abs(objY - birdY) < reach;
}

export function tick(s: State, inputs: Inputs, cfg: GameConfig): State {
  if (s.status !== "running") return s;

  // 1) inputs — both sides may switch in the same tick, independently (AC-1)
  const birds: [Lane, Lane] = [
    inputs.left ? ((1 - s.birds[0]) as Lane) : s.birds[0],
    inputs.right ? ((1 - s.birds[1]) as Lane) : s.birds[1],
  ];

  // 2) move
  let objects = s.objects.map((o) => ({ ...o, y: o.y + cfg.fallSpeed }));

  // 3) collide / eat / miss (AC-2, AC-3). Process EVERY object even after a
  // fatal event so the frozen game-over frame shows post-move positions, the
  // fatal object itself, and every seed eaten this tick (review P2-1).
  let seedsEaten = s.seedsEaten;
  let gameoverReason: State["gameoverReason"];
  const remaining: FallingObject[] = [];
  for (const o of objects) {
    const onBird = o.lane === birds[o.side] && collides(o.y, cfg.birdY, cfg);
    if (o.kind === "pole") {
      if (onBird) {
        gameoverReason = gameoverReason ?? "pole-hit";
        remaining.push(o); // keep the killer visible in the frozen frame
      } else if (o.y - cfg.objHalf <= cfg.fieldHeight) {
        remaining.push(o); // poles that clear the bottom simply despawn
      }
    } else {
      if (onBird) {
        seedsEaten += 1; // eaten — gone
      } else if (o.y - cfg.objHalf > cfg.fieldHeight) {
        gameoverReason = gameoverReason ?? "seed-missed";
        remaining.push(o);
      } else {
        remaining.push(o);
      }
    }
  }
  objects = remaining;
  if (gameoverReason) {
    return {
      ...s, status: "gameover", tick: s.tick + 1, birds, objects, seedsEaten, gameoverReason,
    };
  }

  // 4) spawn — per side, gap-constrained rows (AC-4 fairness floor)
  let rng = s.rng;
  let nextId = s.nextId;
  const nextSpawn: [number, number] = [...s.nextSpawn];
  const newTick = s.tick + 1;
  for (const side of [0, 1] as const) {
    if (newTick >= nextSpawn[side]) {
      let r: number;
      [r, rng] = nextRand(rng);
      const lane: Lane = r < 0.5 ? 0 : 1;
      [r, rng] = nextRand(rng);
      const kind: ObjectKind = r < cfg.poleRatio ? "pole" : "seed";
      objects = [...objects, { id: nextId++, side, lane, kind, y: -cfg.objHalf }];
      [r, rng] = nextRand(rng);
      nextSpawn[side] = newTick + cfg.minGapTicks + Math.floor(r * cfg.gapJitterTicks);
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
  };
}
