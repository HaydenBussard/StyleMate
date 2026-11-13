# Architecture

## Purpose

Analyze human chess games and play human-like, rating- and style-conditioned
opponents. The repo has two parts:

```text
web/                  StyleMate web app (TypeScript) — playable product
src/chess_human_ai/   Python data tools (PGN inventory/manifest) — analysis pipeline
docs/                 Research, architecture, decisions, evaluation results
```

## Web app: three layers

```text
 ┌──────────────── Web interface (src/main.ts, src/ui/) ────────────────┐
 │  BoardView renders 64 <button>s · controls · panels · downloads       │
 └──────────────┬──────────────────────────────────────┬────────────────┘
                │ user moves                           │ reads state
 ┌──────────────▼───────────── Chess logic (src/core/) ▼────────────────┐
 │  GameSession — the only code that touches chess.js: legality,         │
 │  game end, undo, PGN export                                           │
 │  Match — game loop, turn order, illegal-move guardrail, decision log, │
 │  style report                                                         │
 └──────────────┬───────────────────────────────────────────────────────┘
                │ Opponent.chooseMove(MoveRequest) → MoveDecision
 ┌──────────────▼──────────── Model inference (src/opponents/) ─────────┐
 │  Maia3Opponent ── MaiaBackend ──┬─ WorkerMaiaBackend → Web Worker    │
 │     + style.ts (features, tilt) │     (browser; loads 20 MB weights)  │
 │                                 └─ DirectMaiaBackend (Node: tests,    │
 │  PlaceholderOpponent (labelled not human-like)        eval scripts)   │
 └──────────────────────────────────────────────────────────────────────┘
```

### Dependency rule

`ui → core → opponents/types` and `opponents → core/game (types + UCI helpers)`.
`core` never imports DOM code; `opponents` never mutate the game. So:

- Chess logic and opponents are unit-tested in Node without a browser.
- A new model (Maia-2 over HTTP, Maia-3 79M, a personal model) is one new
  class implementing `Opponent`.

### One move, end to end

1. User clicks two squares → `BoardView` → `Match.humanMove()` → `GameSession.play()`.
2. `Match.opponentMove()` builds a `MoveRequest` (FEN, UCI history, *legal moves
   from GameSession*, target Elo, your Elo, style).
3. `Maia3Opponent` asks its backend for Maia's policy; the worker runs the
   forward pass (~0.3 s) off the main thread.
4. It drops anything not in the legal list, applies the style tilt, samples.
5. `Match` applies the move; if a model ever returns an illegal move it throws
   instead of corrupting the game.
6. `Match` records a `DecisionRecord` (FEN, ratings, candidates, chosen move,
   features, baseline features, KL, value head). The UI renders from that.

### Data the app produces

- **PGN** with extra headers: `OpponentModel`, `OpponentHumanLike`,
  `OpponentTargetElo`, `OpponentStyle` — so every exported game records exactly
  what produced it.
- **Decision log (JSONL)** — one record per opponent move. This is the raw
  material for evaluating human-likeness and style later, and it lines up with
  the Python PGN tooling.

## Python tools

`CLI → services → domain`. `domain/` holds plain data types; `services/`
holds PGN inventory/manifest commands. Planned: Stockfish-based move-quality
labelling of PGNs (including PGNs exported from the web app).
