/**
 * PLACEHOLDER OPPONENT — NOT HUMAN-LIKE, NOT MAIA.
 *
 * A one-ply heuristic: it scores each legal move with a few hand-written
 * rules (captures, checks, promotions, hanging the moved piece), turns the
 * scores into probabilities with a softmax, and samples one. "Target Elo"
 * only changes the softmax temperature, so lower settings play more randomly.
 *
 * That is exactly the "strong move, then random blunder" behaviour this
 * project aims to replace. It exists so the board, game loop, logging and PGN
 * export can be built and tested before a real model is integrated.
 */
import { Chess, type Move } from "chess.js";
import type { MoveDecision, MoveRequest, Opponent, OpponentInfo } from "./types";
import { createRng, sampleIndex, type Rng } from "./rng";
import { moveToUci } from "../core/game";

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface PlaceholderOptions {
  seed?: number;
  /** How many candidates to report in the decision log. */
  topK?: number;
}

export class PlaceholderOpponent implements Opponent {
  readonly info: OpponentInfo = {
    id: "placeholder-heuristic@1",
    name: "Placeholder bot",
    humanLike: false,
    description:
      "One-move heuristic with randomness. Not Maia and not human-like; the Elo slider only changes how random it is.",
  };

  private rng: Rng;
  private topK: number;

  constructor(options: PlaceholderOptions = {}) {
    this.rng = createRng(options.seed ?? Date.now());
    this.topK = options.topK ?? 5;
  }

  async chooseMove(req: MoveRequest): Promise<MoveDecision> {
    const t0 = performance.now();
    const chess = new Chess(req.fen);
    const moves = chess.moves({ verbose: true }).filter((m) => req.legalMoves.includes(moveToUci(m)));
    if (moves.length === 0) throw new Error("No legal moves available");

    const scores = moves.map((m) => scoreMove(chess, m));
    const probs = softmax(scores, temperatureForElo(req.targetElo));
    const pick = sampleIndex(probs, this.rng);

    const candidates = moves
      .map((m, i) => ({ move: moveToUci(m), probability: probs[i] }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, this.topK);

    return {
      move: moveToUci(moves[pick]),
      candidates,
      source: this.info.id,
      elapsedMs: performance.now() - t0,
    };
  }
}

/**
 * Map a target rating to a softmax temperature. Higher temperature = flatter
 * distribution = more random. This is an arbitrary curve, not a calibrated
 * rating model — calibrating against real games is a later milestone.
 */
export function temperatureForElo(elo: number): number {
  const clamped = Math.min(2600, Math.max(600, elo));
  return 3.0 - ((clamped - 600) / 2000) * 2.7; // 600 -> 3.0, 2600 -> 0.3
}

export function scoreMove(chess: Chess, m: Move): number {
  let s = 0;
  if (m.captured) s += PIECE_VALUE[m.captured];
  if (m.promotion) s += PIECE_VALUE[m.promotion] - 1;
  chess.move(m);
  if (chess.inCheck()) s += chess.isCheckmate() ? 100 : 0.5;
  // Penalise leaving the moved piece where the opponent can capture it.
  // (Cheap attack test; ignores pins and defenders — it is a placeholder.)
  if (chess.isAttacked(m.to, chess.turn())) s -= PIECE_VALUE[m.promotion ?? m.piece] * 0.8;
  chess.undo();
  return s;
}

export function softmax(xs: number[], temperature: number): number[] {
  const max = Math.max(...xs);
  const exps = xs.map((x) => Math.exp((x - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}
