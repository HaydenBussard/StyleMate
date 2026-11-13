import { Chess } from "chess.js";
import { moveToUci, parseUci } from "../src/core/game";
import { Match } from "../src/core/match";
import { PlaceholderOpponent, softmax, temperatureForElo } from "../src/opponents/placeholder";
import type { MoveDecision, MoveRequest, Opponent } from "../src/opponents/types";

function request(fen: string, targetElo = 1500): MoveRequest {
  const c = new Chess(fen);
  return {
    fen,
    history: [],
    legalMoves: c.moves({ verbose: true }).map(moveToUci),
    targetElo,
    opponentElo: 1500,
  };
}

describe("PlaceholderOpponent", () => {
  it("is honestly labelled as not human-like", () => {
    expect(new PlaceholderOpponent().info.humanLike).toBe(false);
  });

  it("is reproducible with a fixed seed", async () => {
    const fen = new Chess().fen();
    const a = await new PlaceholderOpponent({ seed: 42 }).chooseMove(request(fen));
    const b = await new PlaceholderOpponent({ seed: 42 }).chooseMove(request(fen));
    expect(a.move).toBe(b.move);
  });

  it("returns probabilities that are sorted and sum to at most 1", async () => {
    const d = await new PlaceholderOpponent({ seed: 1, topK: 5 }).chooseMove(request(new Chess().fen()));
    expect(d.candidates).toHaveLength(5);
    const ps = d.candidates.map((c) => c.probability);
    expect([...ps].sort((x, y) => y - x)).toEqual(ps);
    expect(ps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("finds mate in one most of the time at high Elo", async () => {
    // White: Qh5 with Bc4 — Qxf7# is available (scholar's mate pattern).
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const bot = new PlaceholderOpponent({ seed: 7 });
    let mates = 0;
    for (let i = 0; i < 50; i++) if ((await bot.chooseMove(request(fen, 2400))).move === "h5f7") mates++;
    expect(mates).toBeGreaterThan(45);
  });

  it("maps higher Elo to lower temperature (less random)", () => {
    expect(temperatureForElo(600)).toBeGreaterThan(temperatureForElo(1500));
    expect(temperatureForElo(1500)).toBeGreaterThan(temperatureForElo(2600));
    expect(temperatureForElo(100)).toBe(temperatureForElo(600)); // clamped
  });

  it("softmax is a probability distribution", () => {
    const p = softmax([1, 2, 3], 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(p[2]).toBeGreaterThan(p[0]);
  });

  it("only ever plays legal moves across many random self-play games", async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const bot = new PlaceholderOpponent({ seed });
      const ref = new Chess();
      for (let ply = 0; ply < 150 && !ref.isGameOver(); ply++) {
        const d = await bot.chooseMove({ ...request(ref.fen(), 1200), history: [] });
        expect(ref.moves({ verbose: true }).map(moveToUci)).toContain(d.move);
        ref.move(parseUci(d.move));
      }
    }
  }, 60_000);
});

describe("Match controller", () => {
  it("alternates human and opponent moves and logs each decision", async () => {
    const m = new Match({ humanColor: "w", opponent: new PlaceholderOpponent({ seed: 3 }), targetElo: 1200, humanElo: 1500 });
    expect(m.isHumanTurn).toBe(true);
    expect(await m.opponentMove()).toBe(false); // not its turn
    expect(m.humanMove("e2", "e4")).toBe(true);
    expect(m.humanMove("d2", "d4")).toBe(false); // not human's turn
    expect(await m.opponentMove()).toBe(true);
    expect(m.decisions).toHaveLength(1);
    expect(m.decisions[0]).toMatchObject({ ply: 2, targetElo: 1200, source: "placeholder-heuristic@1" });
    expect(m.decisionsJsonl().trim().split("\n")).toHaveLength(1);
  });

  it("opponent moves first when the human plays black", async () => {
    const m = new Match({ humanColor: "b", opponent: new PlaceholderOpponent({ seed: 3 }), targetElo: 1200, humanElo: 1500 });
    expect(m.isHumanTurn).toBe(false);
    expect(await m.opponentMove()).toBe(true);
    expect(m.isHumanTurn).toBe(true);
    expect(m.session.toPgn()).toContain('[Black "You"]');
  });

  it("take-back removes the human move, the reply and its log entry", async () => {
    const m = new Match({ humanColor: "w", opponent: new PlaceholderOpponent({ seed: 3 }), targetElo: 1200, humanElo: 1500 });
    m.humanMove("e2", "e4");
    await m.opponentMove();
    m.takeBack();
    expect(m.session.historyUci).toEqual([]);
    expect(m.decisions).toHaveLength(0);
  });

  it("rejects an opponent that returns an illegal move", async () => {
    const cheater: Opponent = {
      info: { id: "cheater", name: "Cheater", humanLike: false, description: "" },
      chooseMove: async (): Promise<MoveDecision> => ({ move: "e1e8", candidates: [], source: "cheater", elapsedMs: 0 }),
    };
    const m = new Match({ humanColor: "b", opponent: cheater, targetElo: 1500, humanElo: 1500 });
    await expect(m.opponentMove()).rejects.toThrow(/illegal move/);
    expect(m.session.historyUci).toEqual([]);
    expect(m.isOpponentThinking).toBe(false);
  });

  it("records the opponent model in PGN headers", () => {
    const m = new Match({ humanColor: "w", opponent: new PlaceholderOpponent(), targetElo: 1100, humanElo: 1500 });
    const pgn = m.session.toPgn();
    expect(pgn).toContain('[OpponentModel "placeholder-heuristic@1"]');
    expect(pgn).toContain('[OpponentHumanLike "false"]');
    expect(pgn).toContain('[OpponentTargetElo "1100"]');
  });
});
