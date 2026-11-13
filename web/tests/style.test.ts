import { Chess } from "chess.js";
import { moveToUci } from "../src/core/game";
import { Maia3Opponent, type MaiaBackend } from "../src/opponents/maia3";
import { STYLES, applyStyle, expectedFeatures, moveFeatures, positionFeatures } from "../src/opponents/style";

const featuresOf = (fen: string, uci: string) => {
  const c = new Chess(fen);
  const m = c.moves({ verbose: true }).find((x) => moveToUci(x) === uci)!;
  const f = moveFeatures(c, m);
  expect(c.fen()).toBe(fen); // position restored
  return f;
};

describe("move features", () => {
  it("detects captures, checks and castling", () => {
    expect(featuresOf("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", "h5f7")).toMatchObject({
      capture: 1,
      check: 1,
    });
    expect(featuresOf("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1").castle).toBe(1);
    expect(featuresOf(new Chess().fen(), "g1f3")).toMatchObject({ capture: 0, check: 0, castle: 0 });
  });

  it("flags a piece left en prise", () => {
    // Qd1-h5?? can be taken by the knight on f6... use a clean case: white queen to d5 attacked by e6 pawn
    const fen = "rnbqkbnr/pppp1ppp/4p3/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    expect(featuresOf(fen, "d1g4").risk).toBe(0); // g4 not attacked
    expect(featuresOf("rnbqkbnr/pppp1ppp/4p3/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2", "c3d5").risk).toBe(1);
  });

  it("measures forward movement relative to the side to move", () => {
    expect(featuresOf(new Chess().fen(), "e2e4").advance).toBeGreaterThan(0);
    const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(featuresOf(black, "e7e5").advance).toBeGreaterThan(0);
  });
});

describe("applyStyle", () => {
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
  const features = positionFeatures(fen);
  const uniform = Object.fromEntries([...features.keys()].map((m) => [m, 1 / features.size]));

  it("is the identity at strength 0 (KL = 0)", () => {
    const d = applyStyle(uniform, features, STYLES.aggressive.weights, 0);
    d.styled.forEach((p, i) => expect(p).toBeCloseTo(d.base[i], 12));
    expect(d.kl).toBeCloseTo(0, 12);
  });

  it("aggressive raises expected checks/captures; solid lowers risk", () => {
    const base = applyStyle(uniform, features, STYLES.balanced.weights, 1);
    const agg = applyStyle(uniform, features, STYLES.aggressive.weights, 1);
    const sol = applyStyle(uniform, features, STYLES.solid.weights, 1);
    const eb = expectedFeatures(base.moves, base.styled, features);
    const ea = expectedFeatures(agg.moves, agg.styled, features);
    const es = expectedFeatures(sol.moves, sol.styled, features);
    expect(ea.check).toBeGreaterThan(eb.check);
    expect(ea.capture).toBeGreaterThan(eb.capture);
    expect(es.risk).toBeLessThan(eb.risk);
    expect(agg.kl).toBeGreaterThan(0);
    expect(agg.styled.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("never gives probability to moves the model gave zero weight", () => {
    const policy = { ...Object.fromEntries([...features.keys()].map((m) => [m, 0])), g1f3: 1 };
    const d = applyStyle(policy, features, STYLES.aggressive.weights, 1);
    expect(d.styled[d.moves.indexOf("g1f3")]).toBeGreaterThan(0.999);
  });
});

describe("Maia3Opponent with a fake backend", () => {
  const fen = new Chess().fen();
  const legal = new Chess().moves({ verbose: true }).map(moveToUci);
  const fake: MaiaBackend = {
    policy: async () => ({ policy: { e2e4: 0.7, d2d4: 0.3, zzzz: 0.5 }, value: { win: 0.4, draw: 0.2, loss: 0.4 } }),
  };

  it("drops moves that are not legal and renormalises", async () => {
    const bot = new Maia3Opponent(fake, { seed: 1 });
    const d = await bot.chooseMove({ fen, history: [], legalMoves: legal, targetElo: 1500, opponentElo: 1500 });
    expect(["e2e4", "d2d4"]).toContain(d.move);
    expect(d.candidates[0]).toEqual({ move: "e2e4", probability: expect.closeTo(0.7, 6) });
    expect(d.analysis?.value?.draw).toBe(0.2);
    expect(d.analysis?.kl).toBe(0);
  });

  it("clamps Elo into Maia-3's trained 600–2600 range", async () => {
    const seen: number[] = [];
    const spy: MaiaBackend = { policy: async (i) => (seen.push(i.eloSelf, i.eloOppo), { policy: { e2e4: 1 } }) };
    await new Maia3Opponent(spy).chooseMove({ fen, history: [], legalMoves: legal, targetElo: 100, opponentElo: 3200 });
    expect(seen).toEqual([600, 2600]);
  });

  it("labels itself as human-like and records the style in its source id", async () => {
    const bot = new Maia3Opponent(fake, { seed: 1 });
    expect(bot.info.humanLike).toBe(true);
    const d = await bot.chooseMove({
      fen, history: [], legalMoves: legal, targetElo: 1500, opponentElo: 1500,
      style: { id: "aggressive", strength: 0.5 },
    });
    expect(d.source).toContain("style:aggressive@0.5");
  });
});
