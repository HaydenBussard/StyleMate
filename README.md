# Chess Human AI

Tools for analyzing, modeling and playing against human-like chess decisions.

**StyleMate** (`web/`) is a browser app where you play Maia-3 — a neural
network trained to predict the move a human at a chosen rating would play —
with selectable, *measured* playstyles. It runs entirely client-side: no
server, no API keys, $0 compute.

## Features

- Play Maia-3 (5M) at any rating from 600 to 2600, as White, Black or random
- Playstyles — Balanced (pure Maia), Aggressive, Solid — with adjustable strength
- Live **style report**: what the opponent played vs what pure Maia would have,
  per feature, plus the human-likeness cost (KL divergence)
- Opponent's top candidate moves with probabilities, and Maia's predicted
  outcome bar (can be hidden)
- Drag-and-drop or click-to-move, legal-move highlighting, promotion picker;
  right-click or Escape cancels a drag
- Optional chess clock (blitz, rapid, classical, with increment) or no clock
- Take-back (untimed games), resign, flip
- Export PGN (with model/rating/style headers) and a JSONL decision log
- Clearly labelled placeholder bot as fallback

## Quick start

```bash
cd web
npm ci
npm run dev          # downloads + verifies the 20 MB Maia-3 weights on first run
npm test             # 48 tests, including real-model integration tests
npm run eval:styles  # regenerates docs/style-eval.md
npm run release      # source.zip + production build in web/dist
```

## Docs

- [Architecture](docs/architecture.md) — layers, data flow, what each module owns
- [Implementation decisions](docs/decisions.md) — the why behind the code
- [Maia research](docs/maia-research.md) — options, licensing, compute, hosting cost
- [Style evaluation](docs/style-eval.md) — measured effect and cost of each playstyle

## Python tools

```text
src/chess_human_ai/   PGN inventory and manifest commands
tests/                pytest suite
```

```bash
pip install -e ".[dev]" && pytest
```

To have `inventory` and `manifest` recognise your own games, list your player
names (comma-separated) in an environment variable instead of the code:

```bash
export CHESS_HUMAN_AI_PLAYERS="yourLichessName,Your Name"
```

Planned: Stockfish move-quality labelling of PGNs, player style profiles from
your own games, and learned (instead of hand-set) style weights.

## License

AGPL-3.0-or-later. Maia-3 © CSSLab, University of Toronto (AGPL-3.0);
TypeScript port maia3-ts (AGPL-3.0); chess.js (BSD-2-Clause).
