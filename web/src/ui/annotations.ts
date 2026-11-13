/**
 * Board annotations: arrows and circled squares drawn with the right mouse
 * button, as on Lichess and Chess.com. They are display-only: they never
 * touch the game, the PGN or the opponent.
 *
 * - Right-drag from one square to another: arrow. Right-click one square: circle.
 * - Drawing the same thing again in the same colour removes it (toggle).
 * - Modifier keys pick the colour: none = green, Shift = red, Alt/Ctrl = blue,
 *   Shift+Alt/Ctrl = yellow (the Lichess convention).
 * - A left click on the board, or any new move, clears everything.
 *
 * The state logic (`toggle`, `colorFor`, `arrowPoints`) is pure and unit-tested;
 * `renderAnnotations` just turns the state into one SVG laid over the board.
 */
import type { Square } from "chess.js";

export type AnnotationColor = "green" | "red" | "blue" | "yellow";
export interface Annotation {
  from: Square;
  /** Same as `from` for a circled square. */
  to: Square;
  color: AnnotationColor;
}

export const COLORS: Record<AnnotationColor, string> = {
  green: "#15781b",
  red: "#c22d2d",
  blue: "#1f5fbf",
  yellow: "#d9a441",
};

export function colorFor(mods: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey?: boolean }): AnnotationColor {
  const alt = mods.altKey || mods.ctrlKey || !!mods.metaKey;
  if (mods.shiftKey && alt) return "yellow";
  if (mods.shiftKey) return "red";
  if (alt) return "blue";
  return "green";
}

/**
 * Add an annotation, or remove it if the same one (same squares, same colour)
 * is already there. Drawing the same squares in a different colour recolours it.
 */
export function toggle(list: readonly Annotation[], a: Annotation): Annotation[] {
  const i = list.findIndex((x) => x.from === a.from && x.to === a.to);
  if (i === -1) return [...list, a];
  if (list[i].color === a.color) return list.filter((_, j) => j !== i);
  return list.map((x, j) => (j === i ? a : x));
}

/** Square centre in board units (0–8), with a8 at the top-left unless flipped. */
export function center(sq: Square, flipped: boolean): [number, number] {
  const file = sq.charCodeAt(0) - 97; // a = 0
  const rank = Number(sq[1]) - 1; // 1 = 0
  const x = flipped ? 7 - file : file;
  const y = flipped ? rank : 7 - rank;
  return [x + 0.5, y + 0.5];
}

/**
 * Points of an arrow's path. Knight moves bend in an L (long leg first), like
 * Chess.com, so they can't be mistaken for a diagonal; everything else is straight.
 */
export function arrowPoints(from: Square, to: Square, flipped: boolean): [number, number][] {
  const [x1, y1] = center(from, flipped);
  const [x2, y2] = center(to, flipped);
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  if (!knight) return [[x1, y1], [x2, y2]];
  return dy > dx ? [[x1, y1], [x1, y2], [x2, y2]] : [[x1, y1], [x2, y1], [x2, y2]];
}

const SVG_NS = "http://www.w3.org/2000/svg";
const HEAD = 0.42; // arrowhead length, in squares
const START_OFFSET = 0.28; // start a little off the piece's centre, like Lichess

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Build the overlay SVG. `preview` is the arrow/circle currently being drawn (drawn fainter). */
export function renderAnnotations(list: readonly Annotation[], flipped: boolean, preview?: Annotation | null): SVGSVGElement {
  const svg = el("svg", { class: "annotations", viewBox: "0 0 8 8", "aria-hidden": "true" });
  const defs = el("defs", {});
  for (const [name, hex] of Object.entries(COLORS)) {
    const m = el("marker", {
      id: `ah-${name}`, viewBox: "0 0 10 10", refX: 0, refY: 5,
      markerUnits: "userSpaceOnUse", markerWidth: HEAD * 1.15, markerHeight: HEAD * 1.15, orient: "auto",
    });
    m.appendChild(el("path", { d: "M0,0 L10,5 L0,10 z", fill: hex }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  const draw = (a: Annotation, faint: boolean) => {
    const hex = COLORS[a.color];
    const opacity = faint ? 0.5 : 0.8;
    if (a.from === a.to) {
      const [cx, cy] = center(a.from, flipped);
      svg.appendChild(el("circle", { cx, cy, r: 0.45, fill: "none", stroke: hex, "stroke-width": 0.07, opacity }));
      return;
    }
    const pts = arrowPoints(a.from, a.to, flipped);
    // Pull the first point off the start square's centre and stop the last
    // segment short so the arrowhead's tip lands on the target's centre.
    const shift = (p: [number, number], q: [number, number], d: number): [number, number] => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [p[0] + ((q[0] - p[0]) / len) * d, p[1] + ((q[1] - p[1]) / len) * d];
    };
    const out = pts.map((p) => [...p] as [number, number]);
    out[0] = shift(pts[0], pts[1], START_OFFSET);
    const n = pts.length - 1;
    out[n] = shift(pts[n], pts[n - 1], HEAD);
    svg.appendChild(
      el("polyline", {
        points: out.map((p) => p.join(",")).join(" "),
        fill: "none", stroke: hex, "stroke-width": 0.16, "stroke-linejoin": "round",
        "marker-end": `url(#ah-${a.color})`, opacity,
      }),
    );
  };
  for (const a of list) draw(a, false);
  if (preview) draw(preview, true);
  return svg;
}
