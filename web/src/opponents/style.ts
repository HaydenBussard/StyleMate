/**
 * Playstyle layer — measurable, explainable, and deliberately simple.
 *
 * 1. Every legal move gets a small vector of observable FEATURES (does it
 *    capture, give check, push toward the enemy king, leave the piece en
 *    prise, castle…). Features are facts about the move, not opinions.
 * 2. A STYLE is a weight per feature. Given Maia's human-move probabilities
 *    p(m), the styled distribution is
 *
 *        q(m) ∝ p(m) · exp(strength · Σ_k w_k · f_k(m))
 *
 *    so the model still only plays moves humans at that rating plausibly
 *    play; the style just shifts which of those it prefers. strength = 0 is
 *    pure Maia.
 * 3. Because features are measurable, style is measurable: compare the
 *    features of the moves actually played with the features Maia alone
 *    would have produced on average (the "baseline"). The KL divergence
 *    KL(q‖p) quantifies how far the style pulled the opponent away from
 *    plain human-like play — the cost of the style.
 *
 * The preset weights below are hand-chosen starting points, not learned.
 * Learning them from real players' games is a later milestone.
 */
import { Chess, type Move, type Square } from "chess.js";
import { moveToUci, type UciMove } from "../core/game";

export const FEATURE_KEYS = ["capture", "check", "kingPressure", "advance", "risk", "castle"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, number>;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  capture: "Captures",
  check: "Checks",
  kingPressure: "King-zone pressure",
  advance: "Forward moves",
  risk: "Leaves piece en prise",
  castle: "Castling",
};

export type StyleId = "balanced" | "aggressive" | "solid";

export interface StylePreset {
  id: StyleId;
  name: string;
  description: string;
  weights: Features;
}

const ZERO: Features = { capture: 0, check: 0, kingPressure: 0, advance: 0, risk: 0, castle: 0 };

export const STYLES: Record<StyleId, StylePreset> = {
  balanced: {
    id: "balanced",
    name: "Balanced",
    description: "Pure Maia-3: the move distribution of human players at the target rating.",
    weights: ZERO,
  },
  aggressive: {
    id: "aggressive",
    name: "Aggressive",
    description: "Prefers checks, captures, advancing and attacking the king. Tolerates risk.",
    weights: { capture: 0.6, check: 1.0, kingPressure: 0.6, advance: 1.2, risk: 0, castle: 0 },
  },
  solid: {
    id: "solid",
    name: "Solid",
    description: "Prefers castling and safe squares, avoids loose pieces and early adventures.",
    weights: { capture: 0, check: -0.3, kingPressure: 0, advance: -0.8, risk: -1.5, castle: 1.2 },
  },
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function kingZone(chess: Chess, color: "w" | "b"): Square[] {
  const board = chess.board();
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === color) {
        const zone: Square[] = [];
        for (let dr = -1; dr <= 1; dr++)
          for (let df = -1; df <= 1; df++) {
            const rr = r + dr;
            const ff = f + df;
            if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) zone.push(`${"abcdefgh"[ff]}${8 - rr}` as Square);
          }
        return zone;
      }
    }
  return [];
}

function countAttacked(chess: Chess, squares: Square[], by: "w" | "b"): number {
  let n = 0;
  for (const s of squares) if (chess.isAttacked(s, by)) n++;
  return n;
}

/** Features of one legal move. `chess` must be at the position before the move; it is restored. */
export function moveFeatures(chess: Chess, m: Move): Features {
  const me = m.color;
  const them = me === "w" ? "b" : "w";
  const zone = kingZone(chess, them);
  const pressureBefore = countAttacked(chess, zone, me);

  const fromRank = Number(m.from[1]);
  const toRank = Number(m.to[1]);
  const forward = me === "w" ? toRank - fromRank : fromRank - toRank;

  chess.move(m);
  const check = chess.inCheck() ? 1 : 0;
  const pressureAfter = countAttacked(chess, zone, me);
  // En prise: the opponent attacks the destination and we do not defend it,
  // or the moved piece is worth more than the cheapest plausible attacker would cost.
  const attacked = chess.isAttacked(m.to, them);
  const defended = chess.isAttacked(m.to, me);
  const moved = VALUE[m.promotion ?? m.piece];
  const risk = attacked && (!defended || moved > 3) && m.piece !== "k" ? 1 : 0;
  chess.undo();

  return {
    capture: m.captured ? 1 : 0,
    check,
    kingPressure: Math.max(-1, Math.min(1, (pressureAfter - pressureBefore) / 3)),
    advance: Math.max(-1, Math.min(1, forward / 3)),
    risk,
    castle: m.san.startsWith("O-O") ? 1 : 0,
  };
}

/** Features for every legal move in the position, keyed by UCI. */
export function positionFeatures(fen: string): Map<UciMove, Features> {
  const chess = new Chess(fen);
  const out = new Map<UciMove, Features>();
  for (const m of chess.moves({ verbose: true })) out.set(moveToUci(m), moveFeatures(chess, m));
  return out;
}

export interface StyledDistribution {
  moves: UciMove[];
  /** Maia's original probabilities. */
  base: number[];
  /** Probabilities after the style tilt. */
  styled: number[];
  /** KL(styled ‖ base) in nats: how far the style moved away from plain human play. */
  kl: number;
}

export function applyStyle(
  policy: Record<UciMove, number>,
  features: Map<UciMove, Features>,
  weights: Features,
  strength: number,
): StyledDistribution {
  const moves = Object.keys(policy);
  const base = moves.map((m) => policy[m]);
  const logits = moves.map((m, i) => {
    const f = features.get(m) ?? ZERO;
    let s = 0;
    for (const k of FEATURE_KEYS) s += weights[k] * f[k];
    return Math.log(Math.max(base[i], 1e-12)) + strength * s;
  });
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const styled = exps.map((e) => e / sum);
  let kl = 0;
  for (let i = 0; i < moves.length; i++) {
    if (styled[i] > 0) kl += styled[i] * Math.log(styled[i] / Math.max(base[i], 1e-12));
  }
  return { moves, base, styled, kl: Math.max(0, kl) };
}

/** Probability-weighted average of features under a distribution. */
export function expectedFeatures(moves: UciMove[], probs: number[], features: Map<UciMove, Features>): Features {
  const out: Features = { ...ZERO };
  moves.forEach((m, i) => {
    const f = features.get(m) ?? ZERO;
    for (const k of FEATURE_KEYS) out[k] += probs[i] * f[k];
  });
  return out;
}
