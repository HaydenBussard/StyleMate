/**
 * Chess logic layer.
 *
 * GameSession is the only module that talks to chess.js. The UI and the
 * opponents never mutate chess.js directly; they ask GameSession for legal
 * moves and hand it moves to apply. That keeps the rules in one place and
 * makes this module easy to unit-test without a browser.
 */
import { Chess, type Move, type Square } from "chess.js";

export type Color = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

/** A move expressed the way engines (UCI) and Maia expect: e2e4, e7e8q. */
export type UciMove = string;

export interface GameStatus {
  over: boolean;
  /** PGN result token: "1-0", "0-1", "1/2-1/2" or "*" while in progress. */
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  reason:
    | "checkmate"
    | "stalemate"
    | "insufficient material"
    | "threefold repetition"
    | "fifty-move rule"
    | "resignation"
    | "timeout"
    | "timeout vs insufficient material"
    | null;
  inCheck: boolean;
  turn: Color;
}

export interface PlayerInfo {
  white: string;
  black: string;
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">): UciMove {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function parseUci(uci: UciMove): { from: Square; to: Square; promotion?: PromotionPiece } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`Not a UCI move: ${uci}`);
  }
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PromotionPiece | undefined) || undefined,
  };
}

export class GameSession {
  private chess: Chess;
  private resignedBy: Color | null = null;
  private flaggedBy: Color | null = null;
  private readonly startedAt: Date;

  constructor(
    private players: PlayerInfo = { white: "Player", black: "Opponent" },
    private extraHeaders: Record<string, string> = {},
    startFen?: string,
  ) {
    this.chess = startFen ? new Chess(startFen) : new Chess();
    this.startedAt = new Date();
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  /** Moves played so far, in UCI. Maia-3 can use this as its history input. */
  get historyUci(): UciMove[] {
    return this.chess.history({ verbose: true }).map(moveToUci);
  }

  get historySan(): string[] {
    return this.chess.history();
  }

  get lastMove(): Move | undefined {
    const h = this.chess.history({ verbose: true });
    return h[h.length - 1];
  }

  /** Read-only board snapshot for rendering: 8 ranks (8 -> 1) of 8 files (a -> h). */
  board() {
    return this.chess.board();
  }

  legalMoves(): Move[] {
    if (this.status().over) return [];
    return this.chess.moves({ verbose: true });
  }

  legalMovesFrom(square: Square): Move[] {
    if (this.status().over) return [];
    return this.chess.moves({ square, verbose: true });
  }

  /** True when moving from -> to is a pawn promotion (UI must then ask which piece). */
  isPromotion(from: Square, to: Square): boolean {
    return this.legalMovesFrom(from).some((m) => m.to === to && m.promotion);
  }

  /**
   * Apply a move. Returns the chess.js Move on success, or null if it is
   * illegal. Never throws for illegal input, so callers can treat user clicks
   * and model output the same way.
   */
  play(move: UciMove | { from: Square; to: Square; promotion?: PromotionPiece }): Move | null {
    if (this.status().over) return null;
    const m = typeof move === "string" ? safeParse(move) : move;
    if (!m) return null;
    try {
      return this.chess.move(m);
    } catch {
      return null;
    }
  }

  /** Undo the last `plies` half-moves. Returns how many were actually undone. */
  undo(plies = 1): number {
    let n = 0;
    this.resignedBy = null;
    this.flaggedBy = null;
    while (n < plies && this.chess.undo()) n++;
    return n;
  }

  resign(color: Color): void {
    if (!this.status().over) this.resignedBy = color;
  }

  /**
   * `color` ran out of time. Under FIDE/USCF-style rules they lose, unless the
   * other side cannot possibly checkmate, in which case it is a draw.
   */
  timeout(color: Color): void {
    if (!this.status().over) this.flaggedBy = color;
  }

  /** True if `color` has only a king, or king plus a single bishop or knight. */
  private cannotMate(color: Color): boolean {
    const pieces = this.chess
      .board()
      .flat()
      .filter((p) => p && p.color === color && p.type !== "k")
      .map((p) => p!.type);
    return pieces.length === 0 || (pieces.length === 1 && (pieces[0] === "b" || pieces[0] === "n"));
  }

  status(): GameStatus {
    const c = this.chess;
    const base = { inCheck: c.inCheck(), turn: c.turn() };
    if (this.flaggedBy) {
      const winner: Color = this.flaggedBy === "w" ? "b" : "w";
      if (this.cannotMate(winner)) {
        return { ...base, over: true, result: "1/2-1/2", reason: "timeout vs insufficient material" };
      }
      return { ...base, over: true, result: winner === "w" ? "1-0" : "0-1", reason: "timeout" };
    }
    if (this.resignedBy) {
      return { ...base, over: true, result: this.resignedBy === "w" ? "0-1" : "1-0", reason: "resignation" };
    }
    if (c.isCheckmate()) {
      return { ...base, over: true, result: c.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
    }
    if (c.isStalemate()) return { ...base, over: true, result: "1/2-1/2", reason: "stalemate" };
    if (c.isInsufficientMaterial()) return { ...base, over: true, result: "1/2-1/2", reason: "insufficient material" };
    if (c.isThreefoldRepetition()) return { ...base, over: true, result: "1/2-1/2", reason: "threefold repetition" };
    // chess.js isDraw() also covers the 50-move rule once the cases above are excluded.
    if (c.isDraw()) return { ...base, over: true, result: "1/2-1/2", reason: "fifty-move rule" };
    return { ...base, over: false, result: "*", reason: null };
  }

  /**
   * Export the game as PGN with Seven Tag Roster headers plus any extra
   * headers (e.g. which opponent model and target Elo were used). Recording
   * the model in the PGN matters later: evaluation needs to know which
   * opponent produced each game.
   */
  toPgn(): string {
    const st = this.status();
    const pgnChess = new Chess();
    const startFen = this.chess.history({ verbose: true })[0]?.before ?? this.chess.fen();
    const standardStart = new Chess().fen();
    if (startFen !== standardStart) pgnChess.load(startFen);

    const d = this.startedAt;
    const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    const headers: Record<string, string> = {
      Event: "Casual game",
      Site: "StyleMate (https://github.com/HaydenBussard/chess-human-ai)",
      Date: date,
      Round: "-",
      White: this.players.white,
      Black: this.players.black,
      Result: st.result,
      ...this.extraHeaders,
    };
    if (startFen !== standardStart) {
      headers.SetUp = "1";
      headers.FEN = startFen;
    }
    // PGN's Termination tag uses a small fixed vocabulary; keep the detailed reason too.
    if (st.reason) {
      headers.Termination = st.reason.startsWith("timeout") ? "time forfeit" : "normal";
      headers.TerminationDetail = st.reason;
    }
    for (const [k, v] of Object.entries(headers)) pgnChess.setHeader(k, v);
    for (const san of this.chess.history()) pgnChess.move(san);

    // chess.js omits the result token for unfinished/resigned games; PGN requires it.
    let pgn = pgnChess.pgn();
    if (!/(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(pgn)) pgn = `${pgn.trimEnd()} ${st.result}`;
    return pgn + "\n";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function safeParse(uci: string) {
  try {
    return parseUci(uci);
  } catch {
    return null;
  }
}
