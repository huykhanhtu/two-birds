/** Player name persistence + sanitize (Leaderboard Wave 1). Lives OUTSIDE core/ —
 * the name is presentation/identity, never gameplay, so core stays a pure function.
 * Client-only: nothing is sent anywhere (online is a later wave). Versioned key so a
 * later schema change won't clobber saved names. Degrades to in-session on blocked storage. */

const KEY = "twobirds.playerName.v1";
export const MAX_LEN = 12;
export const DEFAULT_NAME = "Khách";

// Light filter only — deep moderation is Wave 4 (leaderboard-trust). Masks matches.
const BADWORDS = ["fuck", "shit", "bitch", "dick", "cunt", "địt", "lồn", "cặc", "đụ"];

const BAD = new Set(BADWORDS.map((w) => w.toLowerCase()));

/** Trim, strip control + zero-width chars, collapse spaces, cap to MAX_LEN *code points*,
 * mask whole-word bad tokens. Returns "" when nothing usable is left (UI shows DEFAULT_NAME).
 * Whole-word (not substring) masking avoids false-positives on legit names ("Đụng", "Dickson");
 * deep moderation is Wave 4 (leaderboard-trust). */
export function sanitizeName(raw: string): string {
  const s = (raw ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "") // control + format (zero-width) chars
    .replace(/\s+/g, " ")
    .trim();
  const capped = [...s].slice(0, MAX_LEN).join(""); // cap by code point, never split a surrogate pair
  return capped
    .split(" ")
    .map((tok) => (BAD.has(tok.toLowerCase()) ? "*".repeat([...tok].length) : tok))
    .join(" ")
    .trim();
}

/** Name to display given a stored (already-sanitized) value. */
export function displayName(stored: string): string {
  return stored.length > 0 ? stored : DEFAULT_NAME;
}

export interface PlayerNameStore {
  /** stored sanitized name ("" if none) */
  get(): string;
  /** sanitize + persist `raw`; returns the stored (sanitized) value */
  set(raw: string): string;
}

export function createPlayerNameStore(): PlayerNameStore {
  let name = "";
  try {
    name = sanitizeName(localStorage.getItem(KEY) ?? "");
  } catch {
    name = ""; // storage unavailable — start blank in-session
  }
  return {
    get: () => name,
    set(raw: string): string {
      name = sanitizeName(raw);
      try {
        localStorage.setItem(KEY, name);
      } catch {
        // storage blocked — keep the in-session name, just don't persist
      }
      return name;
    },
  };
}
