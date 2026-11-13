/**
 * Maia-3 opponent — a human-move model, not a weakened engine.
 *
 * Maia-3 (CSSLab, University of Toronto) predicts the probability that a
 * human at a given rating plays each legal move. This opponent:
 *   1. asks a backend for Maia's policy at (position, history, target Elo, your Elo),
 *   2. optionally tilts that policy toward a playstyle (see style.ts),
 *   3. samples a move at temperature 1, as the official maia3-uci engine does
 *      by default, so it makes the mistakes humans at that level make —
 *      in the proportions they make them.
 *
 * The backend is an interface so the same opponent runs against a Web
 * Worker in the browser and a direct in-process model in tests and scripts.
 */
import { createRng, sampleIndex, type Rng } from "./rng";
import { STYLES, applyStyle, expectedFeatures, positionFeatures } from "./style";
import type { MoveDecision, MoveRequest, Opponent, OpponentInfo } from "./types";

export interface MaiaPolicyInput {
  fen: string;
  /** UCI moves from the standard start position. Omit when unknown (e.g. custom start FEN). */
  history?: string[];
  eloSelf: number;
  eloOppo: number;
}

export interface MaiaPolicyOutput {
  policy: Record<string, number>;
  value?: { win: number; draw: number; loss: number };
}

export interface MaiaBackend {
  policy(input: MaiaPolicyInput): Promise<MaiaPolicyOutput>;
}

/** Maia-3 was trained on Lichess blitz ratings 600–2600. */
export const MAIA3_ELO_RANGE = { min: 600, max: 2600 } as const;

export class Maia3Opponent implements Opponent {
  readonly info: OpponentInfo = {
    id: "maia3-5m@maia3-ts-0.1.0",
    name: "Maia-3",
    humanLike: true,
    description:
      "Maia-3 5M human-move model (CSSLab, U of Toronto), running in your browser. Plays moves humans at the target rating play, sampled in proportion.",
  };

  private rng: Rng;
  private topK: number;

  constructor(
    private backend: MaiaBackend,
    options: { seed?: number; topK?: number } = {},
  ) {
    this.rng = createRng(options.seed ?? Date.now());
    this.topK = options.topK ?? 5;
  }

  async chooseMove(req: MoveRequest): Promise<MoveDecision> {
    const t0 = performance.now();
    const clamp = (e: number) => Math.min(MAIA3_ELO_RANGE.max, Math.max(MAIA3_ELO_RANGE.min, e));
    const out = await this.backend.policy({
      fen: req.fen,
      // maia3-ts treats history as "moves from the standard start"; only send it when non-empty.
      history: req.history.length ? req.history : undefined,
      eloSelf: clamp(req.targetElo),
      eloOppo: clamp(req.opponentElo),
    });

    // Keep only moves the chess-logic layer agrees are legal (defence in depth).
    const policy: Record<string, number> = {};
    let total = 0;
    for (const m of req.legalMoves) {
      const p = out.policy[m] ?? 0;
      policy[m] = p;
      total += p;
    }
    if (req.legalMoves.length === 0) throw new Error("No legal moves available");
    for (const m of req.legalMoves) policy[m] = total > 0 ? policy[m] / total : 1 / req.legalMoves.length;

    const style = STYLES[req.style?.id ?? "balanced"];
    const strength = style.id === "balanced" ? 0 : (req.style?.strength ?? 1);
    const features = positionFeatures(req.fen);
    const dist = applyStyle(policy, features, style.weights, strength);
    const pick = sampleIndex(dist.styled, this.rng);
    const move = dist.moves[pick];

    const candidates = dist.moves
      .map((m, i) => ({ move: m, probability: dist.styled[i] }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, this.topK);

    return {
      move,
      candidates,
      source: `${this.info.id}+style:${style.id}@${strength}`,
      elapsedMs: performance.now() - t0,
      analysis: {
        baseProbability: dist.base[pick],
        played: features.get(move)!,
        baseline: expectedFeatures(dist.moves, dist.base, features),
        kl: dist.kl,
        value: out.value,
      },
    };
  }
}
