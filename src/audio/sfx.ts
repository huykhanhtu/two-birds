/** Sound effects — Web Audio, synthesized (AC-1: zero-asset, zero-dep). Lives OUTSIDE
 * core/ (core stays pure, ADR-0008). AudioContext is created lazily on the first
 * user gesture (AC-2: autoplay policy) and never before. Mute state persists (AC-3). */

const MUTE_KEY = "twobirds.muted.v1";

type Voice = "eat" | "crash" | "miss" | "click";

export interface Sfx {
  /** call once from the first user gesture — creates/resumes the AudioContext */
  unlock(): void;
  play(voice: Voice): void;
  muted(): boolean;
  /** flip mute, persist, return the new state */
  toggleMute(): boolean;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function createSfx(): Sfx {
  // Typed loosely: webkit prefix + test/headless envs without Web Audio.
  const AC: typeof AudioContext | undefined =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  let ctx: AudioContext | null = null;
  let isMuted = readMuted();

  const unlock = (): void => {
    if (ctx || !AC) return;
    try {
      ctx = new AC();
      if (ctx.state === "suspended") void ctx.resume();
    } catch {
      ctx = null; // Web Audio unavailable — degrade silently
    }
  };

  /** one short enveloped tone */
  const tone = (freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void => {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  const play = (voice: Voice): void => {
    if (isMuted || !ctx) return;
    switch (voice) {
      case "eat": // bright upward blip
        tone(660, 0.12, "triangle", 0.2, 990);
        break;
      case "click": // soft tick
        tone(440, 0.06, "square", 0.12);
        break;
      case "crash": // harsh downward buzz
        tone(180, 0.35, "sawtooth", 0.28, 60);
        break;
      case "miss": // sad low tone
        tone(300, 0.4, "sine", 0.24, 120);
        break;
    }
  };

  return {
    unlock,
    play,
    muted: () => isMuted,
    toggleMute(): boolean {
      isMuted = !isMuted;
      try {
        localStorage.setItem(MUTE_KEY, isMuted ? "1" : "0");
      } catch {
        // storage unavailable — keep in-session mute state
      }
      return isMuted;
    },
  };
}
