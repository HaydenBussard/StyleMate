/**
 * Chess clock with Fischer increment. Pure logic, no timers or DOM: callers
 * pass in the current time, which makes it deterministic in tests.
 *
 * Rules, matching common online play:
 * - Nobody's time runs until White makes the first move; Black's clock then starts.
 * - When a player completes a move their clock stops and the increment is added.
 * - A player flags when their remaining time reaches zero on their own turn.
 */
import type { Color } from "./game";

export interface TimeControl {
  /** Stable id used in settings, e.g. "300+3". */
  id: string;
  label: string;
  initialMs: number;
  incrementMs: number;
}

const tc = (min: number, inc: number, label: string): TimeControl => ({
  id: `${min * 60}+${inc}`,
  label,
  initialMs: min * 60_000,
  incrementMs: inc * 1000,
});

/** "none" = untimed. The rest cover blitz, rapid and classical. */
export const TIME_CONTROLS: TimeControl[] = [
  tc(3, 0, "3 + 0 · Blitz"),
  tc(3, 2, "3 + 2 · Blitz"),
  tc(5, 0, "5 + 0 · Blitz"),
  tc(5, 3, "5 + 3 · Blitz"),
  tc(10, 0, "10 + 0 · Rapid"),
  tc(10, 5, "10 + 5 · Rapid"),
  tc(15, 10, "15 + 10 · Rapid"),
  tc(30, 0, "30 + 0 · Classical"),
];

export function findTimeControl(id: string): TimeControl | null {
  return TIME_CONTROLS.find((t) => t.id === id) ?? null;
}

export class ChessClock {
  private remainingMs: Record<Color, number>;
  /** Whose clock is running, and since when. */
  private running: { color: Color; since: number } | null = null;
  private stopped = false;

  constructor(readonly control: TimeControl) {
    this.remainingMs = { w: control.initialMs, b: control.initialMs };
  }

  /** The PGN TimeControl tag value, e.g. "300+3". */
  get pgnTag(): string {
    return `${this.control.initialMs / 1000}+${this.control.incrementMs / 1000}`;
  }

  get runningColor(): Color | null {
    return this.running?.color ?? null;
  }

  remaining(color: Color, now: number): number {
    const base = this.remainingMs[color];
    if (this.running?.color === color) return Math.max(0, base - (now - this.running.since));
    return base;
  }

  /**
   * Call after `mover` completes a move. `plyBefore` is the number of plies
   * played before this move (0 = White's first move, which is free).
   */
  onMove(mover: Color, plyBefore: number, now: number): void {
    if (this.stopped) return;
    const other: Color = mover === "w" ? "b" : "w";
    if (plyBefore === 0) {
      this.running = { color: other, since: now };
      return;
    }
    if (this.running?.color === mover) {
      this.remainingMs[mover] = this.remaining(mover, now) + this.control.incrementMs;
    }
    this.running = { color: other, since: now };
  }

  /** The color that has run out of time, if any. */
  flagged(now: number): Color | null {
    if (!this.running || this.stopped) return null;
    return this.remaining(this.running.color, now) <= 0 ? this.running.color : null;
  }

  /** Freeze both clocks (game over). */
  stop(now: number): void {
    if (this.running) this.remainingMs[this.running.color] = this.remaining(this.running.color, now);
    this.running = null;
    this.stopped = true;
  }
}

/** "4:05", or "0:07.3" under ten seconds, like most chess sites. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const tenths = Math.floor(clamped / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, "0")}.${tenths % 10}`;
  }
  const total = Math.ceil(clamped / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
