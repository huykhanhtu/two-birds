/** Best-score persistence (AC-8/AC-9). Lives OUTSIDE core/ on purpose: this is the
 * only place allowed to touch localStorage — core stays a pure function (ADR-0008).
 * Versioned key so Wave 3 can migrate schema without clobbering old saves.
 * Every access is wrapped: private-mode / disabled storage must degrade to 0, never crash. */

const KEY = "twobirds.bestScore.v1";

export interface BestScoreStore {
  /** current best (0 if none / storage unavailable) */
  get(): number;
  /** persist `score` iff it beats the stored best; returns true when a new record was written */
  submit(score: number): boolean;
}

function readRaw(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0; // SecurityError in private mode, or storage disabled
  }
}

export function createBestScoreStore(): BestScoreStore {
  // Cache in memory so a blocked/absent localStorage still tracks the best within
  // the session (AC-9 graceful degrade) without re-hitting a throwing API each read.
  let best = readRaw();
  return {
    get: () => best,
    submit(score: number): boolean {
      const s = Math.max(0, Math.floor(score));
      if (s <= best) return false;
      best = s;
      try {
        localStorage.setItem(KEY, String(s));
      } catch {
        // storage unavailable — keep the in-session best, just don't persist
      }
      return true;
    },
  };
}
