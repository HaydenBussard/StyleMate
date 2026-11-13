/**
 * Integration tests against the real Maia-3 5M weights. Skipped when the
 * weights have not been downloaded (run `npm run fetch-model`).
 */
import { existsSync, readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { moveToUci, parseUci } from "../src/core/game";
import { Match } from "../src/core/match";
import { DirectMaiaBackend } from "../src/opponents/maia-direct-backend";
import { Maia3Opponent } from "../src/opponents/maia3";

const path = new URL("../public/models/maia3-5m.safetensors", import.meta.url);
const has = existsSync(path);
const load = () => {
  const b = readFileSync(path);
  return new DirectMaiaBackend(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe.skipIf(!has)("Maia-3 5M (real weights)", () => {
  const backend = has ? load() : (null as unknown as DirectMaiaBackend);

  it("returns a probability for every legal move that sums to 1", async () => {
    const fen = new Chess().fen();
    const { policy, value } = await backend.policy({ fen, history: [], eloSelf: 1500, eloOppo: 1500 });
    expect(Object.keys(policy).sort()).toEqual(new Chess().moves({ verbose: true }).map(moveToUci).sort());
    expect(Object.values(policy).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(value!.win + value!.draw + value!.loss).toBeCloseTo(1, 6);
    // Humans overwhelmingly open with e4/d4/Nf3/c4.
    const top4 = ["e2e4", "d2d4", "g1f3", "c2c4"].reduce((a, m) => a + policy[m], 0);
    expect(top4).toBeGreaterThan(0.7);
  }, 30_000);

  it("finds an obvious mate-in-one more often at higher Elo", async () => {
    // Scholar's mate: Qxf7#.
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const low = (await backend.policy({ fen, eloSelf: 600, eloOppo: 600 })).policy.h5f7;
    const high = (await backend.policy({ fen, eloSelf: 2200, eloOppo: 2200 })).policy.h5f7;
    expect(high).toBeGreaterThan(0.5);
    expect(high).toBeGreaterThan(low);
  }, 30_000);

  it("plays a short legal game through the Match controller", async () => {
    const m = new Match({
      humanColor: "w",
      opponent: new Maia3Opponent(backend, { seed: 11 }),
      targetElo: 1500,
      humanElo: 1500,
      style: { id: "balanced", strength: 0 },
    });
    const ref = new Chess();
    for (const uci of ["e2e4", "g1f3", "f1c4"]) {
      if (!m.isHumanTurn) break;
      const legal = m.session.legalMoves().map(moveToUci);
      const mv = legal.includes(uci) ? uci : legal[0];
      const p = parseUci(mv);
      expect(m.humanMove(p.from, p.to, p.promotion)).toBe(true);
      ref.move(p);
      expect(await m.opponentMove()).toBe(true);
      ref.move(m.decisions[m.decisions.length - 1].san);
    }
    expect(m.decisions).toHaveLength(3);
    expect(m.session.fen).toBe(ref.fen());
    const report = m.styleReport()!;
    expect(report.moves).toBe(3);
    expect(report.meanKl).toBeCloseTo(0, 9);
    expect(m.session.toPgn()).toContain('[OpponentModel "maia3-5m@maia3-ts-0.1.0"]');
  }, 60_000);
});
