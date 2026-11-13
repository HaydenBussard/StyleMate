import { Chess } from "chess.js";
import { GameSession, moveToUci, parseUci } from "../src/core/game";

describe("GameSession rules", () => {
  it("starts with 20 legal moves and white to move", () => {
    const g = new GameSession();
    expect(g.legalMoves()).toHaveLength(20);
    expect(g.turn).toBe("w");
  });

  it("accepts legal moves and rejects illegal ones without throwing", () => {
    const g = new GameSession();
    expect(g.play("e2e4")).not.toBeNull();
    expect(g.play("e2e4")).toBeNull(); // no pawn on e2 anymore
    expect(g.play("e7e6x" as string)).toBeNull(); // malformed
    expect(g.play({ from: "e1", to: "e3" })).toBeNull(); // black to move, and illegal
    expect(g.historyUci).toEqual(["e2e4"]);
  });

  it("detects checkmate (fool's mate) and stops accepting moves", () => {
    const g = new GameSession();
    for (const m of ["f2f3", "e7e5", "g2g4", "d8h4"]) expect(g.play(m)).not.toBeNull();
    const st = g.status();
    expect(st).toMatchObject({ over: true, result: "0-1", reason: "checkmate", inCheck: true });
    expect(g.legalMoves()).toHaveLength(0);
    expect(g.play("a2a3")).toBeNull();
  });

  it("detects stalemate", () => {
    const g = new GameSession(undefined, {}, "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(g.status()).toMatchObject({ over: true, result: "1/2-1/2", reason: "stalemate" });
  });

  it("handles promotion, castling and en passant", () => {
    const promo = new GameSession(undefined, {}, "8/P6k/8/8/8/8/8/K7 w - - 0 1");
    expect(promo.isPromotion("a7", "a8")).toBe(true);
    expect(promo.play("a7a8n")?.san).toBe("a8=N");

    const castle = new GameSession(undefined, {}, "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(castle.play("e1g1")?.san).toBe("O-O");

    const ep = new GameSession();
    for (const m of ["e2e4", "a7a6", "e4e5", "d7d5"]) ep.play(m);
    expect(ep.play("e5d6")?.san).toBe("exd6");
  });

  it("undo and resign update status", () => {
    const g = new GameSession();
    g.play("e2e4");
    g.play("e7e5");
    expect(g.undo(2)).toBe(2);
    expect(g.historyUci).toEqual([]);
    g.resign("w");
    expect(g.status()).toMatchObject({ over: true, result: "0-1", reason: "resignation" });
  });

  it("converts between chess.js moves and UCI", () => {
    expect(parseUci("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(() => parseUci("zz")).toThrow();
    expect(moveToUci({ from: "g1", to: "f3" })).toBe("g1f3");
  });
});

describe("PGN export", () => {
  it("produces PGN that round-trips through a PGN parser with the same moves", () => {
    const g = new GameSession({ white: "Hayden", black: "Bot" }, { OpponentModel: "test@1" });
    const moves = ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6"];
    moves.forEach((m) => g.play(m));
    const pgn = g.toPgn();

    expect(pgn).toContain('[White "Hayden"]');
    expect(pgn).toContain('[Black "Bot"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain('[OpponentModel "test@1"]');
    expect(pgn.trim().endsWith("*")).toBe(true);

    const reparsed = new Chess();
    reparsed.loadPgn(pgn);
    expect(reparsed.history({ verbose: true }).map(moveToUci)).toEqual(moves);
    expect(reparsed.fen()).toBe(g.fen);
  });

  it("records result and termination for a finished game", () => {
    const g = new GameSession();
    ["f2f3", "e7e5", "g2g4", "d8h4"].forEach((m) => g.play(m));
    const pgn = g.toPgn();
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[Termination "checkmate"]');
    expect(pgn.trim().endsWith("0-1")).toBe(true);
  });

  it("includes SetUp/FEN headers for a custom start position", () => {
    const fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
    const g = new GameSession(undefined, {}, fen);
    g.play("a7a8q");
    const pgn = g.toPgn();
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${fen}"]`);
    const reparsed = new Chess();
    reparsed.loadPgn(pgn);
    expect(reparsed.fen()).toBe(g.fen);
  });

  it("writes the result token after a resignation", () => {
    const g = new GameSession();
    g.play("e2e4");
    g.resign("b");
    const pgn = g.toPgn();
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn.trim().endsWith("1-0")).toBe(true);
  });
});
