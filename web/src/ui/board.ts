/**
 * Board view: renders a GameSession as 64 <button> squares and turns user
 * input into (from, to) move requests. It holds only UI state (selection,
 * drag, flip); all rules come from GameSession.
 *
 * Two input styles share one code path:
 * - click-to-move: click a piece, then a highlighted square;
 * - drag-and-drop: press on a piece and drag it, using Pointer Events so mouse,
 *   touch and pen all behave the same.
 * A press that moves less than DRAG_THRESHOLD_PX is treated as a click, so a
 * slightly shaky tap still selects instead of starting a drag.
 *
 * Squares are real buttons so the board is keyboard- and screen-reader
 * accessible without extra work.
 */
import type { Move, Square } from "chess.js";
import type { GameSession } from "../core/game";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const FILES = "abcdefgh";
const DRAG_THRESHOLD_PX = 5;

interface DragState {
  from: Square;
  pointerId: number;
  startX: number;
  startY: number;
  /** Floating copy of the piece that follows the pointer; null until the threshold is passed. */
  ghost: HTMLElement | null;
}

export interface BoardCallbacks {
  /** Return true if the move was accepted. */
  onMove(from: Square, to: Square): void;
  /** Whether the user may currently move pieces of this color. */
  canInteract(): boolean;
}

export class BoardView {
  private selected: Square | null = null;
  private targets: Move[] = [];
  private drag: DragState | null = null;
  /** Set after a drag ends so the browser's trailing click doesn't re-handle the same input. */
  private suppressClick = false;
  flipped = false;

  constructor(
    private root: HTMLElement,
    private getSession: () => GameSession,
    private cb: BoardCallbacks,
  ) {
    root.addEventListener("click", (e) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-square]");
      if (btn) this.handleClick(btn.dataset.square as Square);
    });
    root.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    root.addEventListener("pointermove", (e) => this.onPointerMove(e));
    root.addEventListener("pointerup", (e) => this.onPointerUp(e));
    root.addEventListener("pointercancel", () => this.cancelDrag());
    // Stop the browser's native drag of the glyph text.
    root.addEventListener("dragstart", (e) => e.preventDefault());
  }

  clearSelection(): void {
    this.selected = null;
    this.targets = [];
    this.cancelDrag();
  }

  // ---- Drag-and-drop ---------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.cb.canInteract()) return;
    const sq = squareAt(e.target);
    if (!sq) return;
    const moves = this.getSession().legalMovesFrom(sq);
    if (!moves.length) return; // empty square or opponent piece: let click handling decide
    this.drag = { from: sq, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ghost: null };
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      this.startDrag(d);
    }
    e.preventDefault();
    this.positionGhost(d.ghost!, e.clientX, e.clientY);
    this.highlightHover(squareAtPoint(e.clientX, e.clientY));
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.ghost) {
      // Never passed the threshold: this was a tap. The click event handles it.
      this.drag = null;
      return;
    }
    const to = squareAtPoint(e.clientX, e.clientY);
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    this.cancelDrag();
    if (to && to !== d.from && this.targets.some((m) => m.to === to)) {
      this.selected = null;
      this.targets = [];
      this.cb.onMove(d.from, to);
      return;
    }
    // Dropped off-target: keep the piece selected so click-to-move still works.
    this.render();
  }

  private startDrag(d: DragState): void {
    this.selected = d.from;
    this.targets = this.getSession().legalMovesFrom(d.from);
    this.render();
    const fromBtn = this.root.querySelector<HTMLElement>(`[data-square="${d.from}"]`);
    const piece = fromBtn?.querySelector<HTMLElement>(".piece");
    if (!fromBtn || !piece) return;
    const ghost = piece.cloneNode(true) as HTMLElement;
    ghost.classList.add("drag-ghost");
    const size = fromBtn.getBoundingClientRect().width;
    ghost.style.width = ghost.style.height = `${size}px`;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    fromBtn.classList.add("drag-origin");
    // Capture only once a real drag starts; capturing on press would retarget the tap's click event.
    this.root.setPointerCapture(d.pointerId);
  }

  private positionGhost(ghost: HTMLElement, x: number, y: number): void {
    const half = ghost.offsetWidth / 2;
    ghost.style.transform = `translate(${x - half}px, ${y - half}px)`;
  }

  private highlightHover(sq: Square | null): void {
    for (const el of this.root.querySelectorAll(".drag-over")) el.classList.remove("drag-over");
    if (sq) this.root.querySelector(`[data-square="${sq}"]`)?.classList.add("drag-over");
  }

  private cancelDrag(): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    d.ghost?.remove();
    if (this.root.hasPointerCapture?.(d.pointerId)) this.root.releasePointerCapture(d.pointerId);
    this.highlightHover(null);
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
        if (this.drag?.ghost && this.drag.from === sq) btn.classList.add("drag-origin");
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

function squareAt(target: EventTarget | null): Square | null {
  const btn = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-square]");
  return (btn?.dataset.square as Square | undefined) ?? null;
}

function squareAtPoint(x: number, y: number): Square | null {
  return squareAt(document.elementFromPoint(x, y));
}

function coord(kind: string, text: string): HTMLElement {
  const s = document.createElement("span");
  s.className = `coord ${kind}`;
  s.textContent = text;
  s.setAttribute("aria-hidden", "true");
  return s;
}
