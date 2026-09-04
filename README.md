# Chess Human AI Project

Tool for analyzing, modeling, and simulating human chess decisions based on unique playstyle characteristics.

## Initial goal

Analyze a PGN and produce a structured report of move quality,
evaluation swings, and recurring mistakes.

## Planned direction

- Parse and normalize chess PGNs
- Analyze moves with Stockfish
- Classify move quality and common error types
- Build player style and error profiles
- Explore human-like opponent behavior using rating and playstyle

## Development

This project uses a `src/` layout.

```text
src/chess_human_ai/   Application package
tests/                Automated tests
data/                 Local, untracked chess data
docs/                 Architecture and project notes
scripts/              One-off developer scripts
```