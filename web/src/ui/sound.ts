// Move sounds, synthesized with the Web Audio API.
//
// Why synthesize instead of shipping audio files: no assets to license or
// download, and the whole thing is ~60 lines you can read. Each sound is a
// short burst of filtered noise (the "knock" of a piece) with a quick decay.

export type SoundKind = "move" | "capture" | "check" | "end";

/** Pick a sound from a SAN move. Pure, so it's unit-tested. Check beats capture. */
export function soundForSan(san: string): SoundKind {
  if (san.endsWith("#")) return "end";
  if (san.endsWith("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}

// Tone settings per sound: filter frequency (Hz), length (s), loudness.
const VOICE: Record<SoundKind, { freq: number; dur: number; gain: number; second?: number }> = {
  move: { freq: 1800, dur: 0.06, gain: 0.5 },
  capture: { freq: 1100, dur: 0.09, gain: 0.7, second: 0.05 }, // double knock
  check: { freq: 2600, dur: 0.08, gain: 0.55, second: 0.07 },
  end: { freq: 700, dur: 0.25, gain: 0.6, second: 0.12 },
};

export class SoundPlayer {
  muted = false;
  private ctx: AudioContext | undefined;

  play(kind: SoundKind): void {
    if (this.muted) return;
    try {
      // Browsers only allow audio after a user gesture; by the time a move is
      // played the user has clicked the board, so creating the context here works.
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      const v = VOICE[kind];
      this.knock(v.freq, v.dur, v.gain, 0);
      if (v.second) this.knock(v.freq * 0.8, v.dur, v.gain * 0.8, v.second);
    } catch {
      /* no audio support — stay silent rather than break the game */
    }
  }

  private knock(freq: number, dur: number, gain: number, delay: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(t);
  }
}
