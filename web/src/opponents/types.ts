/**
 * Model-inference boundary.
 *
 * Every opponent — today's placeholder, a future in-browser Maia-3 model, or
 * a Python Maia server behind HTTP — implements this one interface. The UI
 * only knows about `Opponent`, so swapping the model never touches chess
 * logic or rendering code.
 */
import type { UciMove } from "../core/game";
import type { Features, StyleId } from "./style";

export interface MoveRequest {
  /** Current position. */
  fen: string;
  /** Moves from the start position in UCI. Maia-3 uses recent history as input. */
  history: UciMove[];
  /** Legal moves in UCI, supplied by the chess-logic layer (single source of truth). */
  legalMoves: UciMove[];
  /** Rating the opponent should imitate. */
  targetElo: number;
  /** Rating of the human it is playing (Maia conditions on both). */
  opponentElo: number;
  /** Playstyle preset and how strongly to apply it (0 = none, 1 = full preset weights). */
  style?: { id: StyleId; strength: number };
}

export interface Candidate {
  move: UciMove;
  /** Probability the opponent assigned to this move (0..1). */
  probability: number;
}

export interface MoveDecision {
  move: UciMove;
  /** Top candidate moves, highest probability first. Logged for later evaluation. */
  candidates: Candidate[];
  /** Which opponent produced this decision, e.g. "placeholder-heuristic@1". */
  source: string;
  /** Wall-clock time spent choosing, in ms. */
  elapsedMs: number;
  /** Model-backed opponents only: the extra evidence needed to measure behaviour. */
  analysis?: DecisionAnalysis;
}

export interface DecisionAnalysis {
  /** Unstyled model probability of the move actually played. */
  baseProbability: number;
  /** Features of the move actually played. */
  played: Features;
  /** Average features the unstyled model would have produced here. */
  baseline: Features;
  /** KL(styled ‖ base) in nats for this position. 0 for the Balanced style. */
  kl: number;
  /** Value head: outcome probabilities for the side to move, before the move. */
  value?: { win: number; draw: number; loss: number };
}

export interface OpponentInfo {
  id: string;
  name: string;
  /** Must be true only for opponents backed by a model of human play. */
  humanLike: boolean;
  /** Short, honest description shown in the UI. */
  description: string;
}

export interface Opponent {
  readonly info: OpponentInfo;
  /** Async so network- or worker-backed models fit the same contract. */
  chooseMove(request: MoveRequest): Promise<MoveDecision>;
}
