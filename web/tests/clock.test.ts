import { ChessClock, findTimeControl, formatClock, TIME_CONTROLS } from "../src/core/clock";
import { GameSession } from "../src/core/game";
import { Match } from "../src/core/match";
import type { MoveDecision, MoveRequest, Opponent } from "../src/opponents/types";

const blitz = findTimeControl("180+2")!;

describe("ChessClock", () => {
  it("does not run until White's first move, then runs Black's clock", () => {
    const c = new ChessClock(blitz);
    expect(c.runningColor).toBeNull();
    expect(c.flagged(1e9)).toBeNull();
    c.onMove("w", 0, 1000);
    expect(c.runningColor).toBe("b");
    expect(c.remaining("w", 5000)).toBe(180_000); // White's first move was free, no increment
    expect(c.remaining("b", 5000)).toBe(176_000);
  });

  it("subtracts thinking time and adds the increment after each move", () => {
    const c = new ChessClock(blitz);
    c.onMove("w", 0, 0);
    c.onMove("b", 1, 10_000); // Black thought 10 s
    expect(c.remaining("b", 10_000)).toBe(180_000 - 10_000 + 2_000);
    c.onMove("w", 2, 13_000); // White thought 3 s
    expect(c.remaining("w", 13_000)).toBe(180_000 - 3_000 + 2_000);
    expect(c.runningColor).toBe("b");
  });

  it("flags the side to move at zero and freezes on stop", () => {
    const c = new ChessClock(findTimeControl("180+0")!);
    c.onMove("w", 0, 0);
    expect(c.flagged(179_999)).toBeNull();
    expect(c.flagged(180_000)).toBe("b");
    c.stop(181_000);
    expect(c.flagged(999_999)).toBeNull();
    expect(c.remaining("b", 999_999)).toBe(0);
  });

  it("formats like chess sites", () => {
    expect(formatClock(300_000)).toBe("5:00");
    expect(formatClock(65_400)).toBe("1:06");
    expect(formatClock(9_870)).toBe("0:09.8");
    expect(formatClock(-5)).toBe("0:00.0");
    expect(formatClock(3_600_000)).toBe("1:00:00");
  });

  it("has unique ids that round-trip", () => {
    const ids = TIME_CONTROLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TIME_CONTROLS) expect(findTimeControl(t.id)).toBe(t);
    expect(findTimeControl("none")).toBeNull();
  });
});

describe("timeouts in GameSession", () => {
  it("a flag loses when the opponent has mating material", () => {
    const g = new GameSession();
    g.play("e2e4");
    g.timeout("b");
    expect(g.status()).toMatchObject({ over: true, result: "1-0", reason: "timeout" });
    expect(g.toPgn()).toContain('[Termination "time forfeit"]');
  });

  it("a flag is a draw when the opponent cannot possibly mate", () => {
    const g = new GameSession(undefined, undefined, "8/8/8/4k3/8/8/3NK3/7q w - - 0 1");
    g.timeout("b"); // White has only K+N
    expect(g.status()).toMatchObject({ over: true, result: "1/2-1/2", reason: "timeout vs insufficient material" });
  });
});

/** Plays a fixed list of moves, taking `delayMs` of simulated time per move. */
class ScriptedOpponent implements Opponent {
  info = { id: "scripted", name: "Scripted", humanLike: false, description: "" };
  constructor(private moves: string[], private clock: { t: number }, private delayMs: number) {}
  async chooseMove(_req: MoveRequest): Promise<MoveDecision> {
    this.clock.t += this.delayMs;
    return { move: this.moves.shift()!, candidates: [], source: "scripted", elapsedMs: 0 };
  }
}

describe("Match with a clock", () => {
  it("records the time control, runs the clocks and disables take-back", async () => {
    const time = { t: 0 };
    const m = new Match({
      humanColor: "w",
      opponent: new ScriptedOpponent(["e7e5", "b8c6"], time, 4_000),
      targetElo: 1500,
      humanElo: 1500,
      timeControl: blitz,
      now: () => time.t,
    });
    expect(m.canTakeBack).toBe(false);
    expect(m.humanMove("e2", "e4")).toBe(true);
    await m.opponentMove();
    expect(m.clock!.remaining("b", time.t)).toBe(180_000 - 4_000 + 2_000);
    time.t += 1_000;
    expect(m.humanMove("g1", "f3")).toBe(true);
    expect(m.clock!.remaining("w", time.t)).toBe(180_000 - 1_000 + 2_000);
    expect(m.session.toPgn()).toContain('[TimeControl "180+2"]');
  });

  it("ends the game when the human runs out of time", async () => {
    const time = { t: 0 };
    const m = new Match({
      humanColor: "b",
      opponent: new ScriptedOpponent(["e2e4"], time, 0),
      targetElo: 1500,
      humanElo: 1500,
      timeControl: findTimeControl("180+0")!,
      now: () => time.t,
    });
    await m.opponentMove(); // White's free first move; Black's clock starts
    time.t += 181_000;
    expect(m.checkFlag()).toBe(true);
    expect(m.session.status()).toMatchObject({ over: true, result: "1-0", reason: "timeout" });
    expect(m.humanMove("e7", "e5")).toBe(false);
  });

  it("untimed games keep take-back and tag TimeControl as '-'", () => {
    const m = new Match({ humanColor: "w", opponent: new ScriptedOpponent([], { t: 0 }, 0), targetElo: 1500, humanElo: 1500 });
    expect(m.clock).toBeNull();
    m.humanMove("e2", "e4");
    expect(m.canTakeBack).toBe(true);
    expect(m.session.toPgn()).toContain('[TimeControl "-"]');
  });
});
