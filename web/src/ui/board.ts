/**
 * Board view: renders a GameSession as 64 <button> squares and turns clicks
 * into (from, to) move requests. It holds only UI state (selection, flip);
 * all rules come from GameSession.
 *
 * Squares are real buttons so the board is keyboard- and screen-reader
 * accessible without extra work.
 */
import type { Move, Square } from "chess.js";
import type { GameSession } from "../core/game";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const FILES = "abcdefgh";

export interface BoardCallbacks {
  /** Return true if the move was accepted. */
  onMove(from: Square, to: Square): void;
  /** Whether the user may currently move pieces of this color. */
  canInteract(): boolean;
}

export class BoardView {
  private selected: Square | null = null;
  private targets: Move[] = [];
  flipped = false;

  constructor(
    private root: HTMLElement,
    private getSession: () => GameSession,
    private cb: BoardCallbacks,
  ) {
    root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-square]");
      if (btn) this.handleClick(btn.dataset.square as Square);
    });
  }

  clearSelection(): void {
    this.selected = null;
    this.targets = [];
  }

  private handleClick(sq: Square): void {
    const session = this.getSession();
    if (!this.cb.canInteract()) return;

    if (this.selected && this.targets.some((m) => m.to === sq)) {
      const from = this.selected;
      this.clearSelection();
      this.cb.onMove(from, sq);
      return;
    }
    const moves = session.legalMovesFrom(sq);
    if (moves.length && sq !== this.selected) {
      this.selected = sq;
      this.targets = moves;
    } else {
      this.clearSelection();
    }
    this.render();
  }

  render(): void {
    const session = this.getSession();
    const board = session.board();
    const last = session.lastMove;
    const st = session.status();
    const frag = document.createDocumentFragment();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rank = this.flipped ? r : 7 - r; // 0 = rank 1
        const file = this.flipped ? 7 - f : f;
        const sq = `${FILES[file]}${rank + 1}` as Square;
        const piece = board[7 - rank][file];

        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.square = sq;
        btn.className = `sq ${(rank + file) % 2 === 0 ? "dark" : "light"}`;
        if (last && (last.from === sq || last.to === sq)) btn.classList.add("last");
        if (this.selected === sq) btn.classList.add("selected");
        const target = this.targets.find((m) => m.to === sq);
        if (target) btn.classList.add(target.captured ? "capture" : "target");
        if (st.inCheck && piece?.type === "k" && piece.color === st.turn) btn.classList.add("check");

        btn.setAttribute(
          "aria-label",
          piece ? `${sq}, ${piece.color === "w" ? "white" : "black"} ${NAME[piece.type]}` : `${sq}, empty`,
        );
        if (piece) {
          const span = document.createElement("span");
          span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
          span.textContent = GLYPH[piece.type] + "\uFE0E"; // text presentation, never emoji
          span.setAttribute("aria-hidden", "true");
          btn.appendChild(span);
        }
        // Coordinates on the edge squares, like a printed board.
        if (f === 0) btn.appendChild(coord("rank", String(rank + 1)));
        if (r === 7) btn.appendChild(coord("file", FILES[file]));
        frag.appendChild(btn);
      }
    }
    this.root.replaceChildren(frag);
  }
}

function coord(kind: string, text: string): HTMLElement {
  const s = document.createElement("span");
  s.className = `coord ${kind}`;
  s.textContent = text;
  s.setAttribute("aria-hidden", "true");
  return s;
}
