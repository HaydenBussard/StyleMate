/**
 * Match controller: the game loop, with no DOM code.
 *
 * Owns one GameSession and one Opponent, enforces whose turn it is, and keeps
 * a decision log of every opponent move (position, target Elo, candidate
 * probabilities, chosen move). That log is the seed of the evaluation dataset
 * needed later to measure whether a model actually plays like a human.
 */
import type { Square } from "chess.js";
import { GameSession, type Color, type PromotionPiece } from "./game";
import { ChessClock, type TimeControl } from "./clock";
import type { Candidate, DecisionAnalysis, Opponent } from "../opponents/types";
import { FEATURE_KEYS, type Features, type StyleId } from "../opponents/style";

export interface DecisionRecord {
  ply: number;
  fen: string;
  targetElo: number;
  opponentElo: number;
  move: string;
  san: string;
  candidates: Candidate[];
  source: string;
  elapsedMs: number;
  analysis?: DecisionAnalysis;
}

/**
 * How the opponent actually behaved this game, measured from its decisions.
 * `shift` = played − baseline: positive means the opponent did more of that
 * thing than unstyled Maia would have in the same positions.
 */
export interface StyleReport {
  moves: number;
  played: Features;
  baseline: Features;
  shift: Features;
  /** Mean KL(styled ‖ Maia) per move, in nats — the human-likeness cost of the style. */
  meanKl: number;
  /** Mean Maia probability of the moves played (how "expected" its moves were). */
  meanBaseProbability: number;
}

export interface MatchOptions {
  humanColor: Color;
  opponent: Opponent;
  targetElo: number;
  humanElo: number;
  humanName?: string;
  style?: { id: StyleId; strength: number };
  /** Omit or null for an untimed game. */
  timeControl?: TimeControl | null;
  /** Injectable time source (ms) so tests can drive the clock. */
  now?: () => number;
}

export class Match {
  readonly session: GameSession;
  readonly decisions: DecisionRecord[] = [];
  readonly clock: ChessClock | null;
  private thinking = false;
  private readonly now: () => number;

  constructor(readonly options: MatchOptions) {
    this.now = options.now ?? (() => performance.now());
    this.clock = options.timeControl ? new ChessClock(options.timeControl) : null;
    const botName = `${options.opponent.info.name} (${options.targetElo})`;
    const human = options.humanName ?? "You";
    this.session = new GameSession(
      options.humanColor === "w" ? { white: human, black: botName } : { white: botName, black: human },
      {
        OpponentModel: options.opponent.info.id,
        OpponentHumanLike: String(options.opponent.info.humanLike),
        OpponentTargetElo: String(options.targetElo),
        ...(options.style ? { OpponentStyle: `${options.style.id}@${options.style.strength}` } : {}),
        TimeControl: this.clock ? this.clock.pgnTag : "-",
      },
    );
  }

  get isHumanTurn(): boolean {
    return !this.thinking && !this.session.status().over && this.session.turn === this.options.humanColor;
  }

  get isOpponentThinking(): boolean {
    return this.thinking;
  }

  humanMove(from: Square, to: Square, promotion?: PromotionPiece): boolean {
    if (!this.isHumanTurn || this.checkFlag()) return false;
    const ply = this.session.historyUci.length;
    if (this.session.play({ from, to, promotion }) === null) return false;
    this.afterMove(this.options.humanColor, ply);
    return true;
  }

  /** Whether take-back is allowed. Timed games disallow it, as rated play does. */
  get canTakeBack(): boolean {
    return !this.clock && !this.thinking && this.session.historyUci.length > 0;
  }

  /**
   * Check whether the side to move has run out of time; if so, end the game.
   * The UI calls this on every clock tick. Returns true if someone flagged.
   */
  checkFlag(): boolean {
    if (!this.clock || this.session.status().over) return false;
    const flagged = this.clock.flagged(this.now());
    if (!flagged) return false;
    this.session.timeout(flagged);
    this.clock.stop(this.now());
    return true;
  }

  /** End-of-game bookkeeping (resignation etc.) — freezes the clock. */
  resign(): void {
    this.session.resign(this.options.humanColor);
    this.clock?.stop(this.now());
  }

  private afterMove(mover: Color, plyBefore: number): void {
    if (!this.clock) return;
    this.clock.onMove(mover, plyBefore, this.now());
    if (this.session.status().over) this.clock.stop(this.now());
  }

  /** Ask the opponent for a move and apply it. Resolves to false if it was not the opponent's turn. */
  async opponentMove(): Promise<boolean> {
    const s = this.session;
    if (this.thinking || s.status().over || s.turn === this.options.humanColor) return false;
    this.thinking = true;
    try {
      const fen = s.fen;
      const decision = await this.options.opponent.chooseMove({
        fen,
        history: s.historyUci,
        legalMoves: s.legalMoves().map((m) => `${m.from}${m.to}${m.promotion ?? ""}`),
        targetElo: this.options.targetElo,
        opponentElo: this.options.humanElo,
        style: this.options.style,
      });
      // The opponent may have lost on time while thinking.
      if (this.checkFlag()) return false;
      const ply = s.historyUci.length;
      const played = s.play(decision.move);
      // Guardrail: a model must never be allowed to corrupt the game with an illegal move.
      if (!played) throw new Error(`Opponent ${decision.source} returned illegal move ${decision.move}`);
      this.afterMove(s.turn === "w" ? "b" : "w", ply);
      this.decisions.push({
        ply: s.historyUci.length,
        fen,
        targetElo: this.options.targetElo,
        opponentElo: this.options.humanElo,
        move: decision.move,
        san: played.san,
        candidates: decision.candidates,
        source: decision.source,
        elapsedMs: Math.round(decision.elapsedMs * 10) / 10,
        analysis: decision.analysis,
      });
      return true;
    } finally {
      this.thinking = false;
    }
  }

  /** Take back the human's last move (and the opponent's reply, if any). */
  takeBack(): void {
    if (!this.canTakeBack) return;
    const s = this.session;
    const plies = s.turn === this.options.humanColor ? 2 : 1;
    s.undo(plies);
    const keep = s.historyUci.length;
    while (this.decisions.length && this.decisions[this.decisions.length - 1].ply > keep) this.decisions.pop();
  }

  styleReport(): StyleReport | null {
    const ds = this.decisions.filter((d) => d.analysis);
    if (ds.length === 0) return null;
    const zero = () => Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as Features;
    const played = zero();
    const baseline = zero();
    let kl = 0;
    let bp = 0;
    for (const d of ds) {
      const a = d.analysis!;
      for (const k of FEATURE_KEYS) {
        played[k] += a.played[k] / ds.length;
        baseline[k] += a.baseline[k] / ds.length;
      }
      kl += a.kl / ds.length;
      bp += a.baseProbability / ds.length;
    }
    const shift = zero();
    for (const k of FEATURE_KEYS) shift[k] = played[k] - baseline[k];
    return { moves: ds.length, played, baseline, shift, meanKl: kl, meanBaseProbability: bp };
  }

  /** Decision log as JSON Lines — one record per opponent move. */
  decisionsJsonl(): string {
    return this.decisions.map((d) => JSON.stringify(d)).join("\n") + (this.decisions.length ? "\n" : "");
  }
}
