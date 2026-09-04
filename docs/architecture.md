# Architecture

## Purpose

Analyze human chess games and eventually support player profiling
and human-like chess opponents.

## Current flow

PGN file -> CLI -> analysis service -> structured report

## Dependency rule

```text
CLI/API/UI -> services -> domain
```

- `domain/` contains chess rules, analysis objects, player profiles,
  classifications, and move-selection logic.
- `services/` coordinates PGN parsing, engines, model inference,
  and domain logic.
- Future `api/` or UI code should call services.
- `domain/` must not import UI, FastAPI, database, or engine-process code.

## Deferred decisions

- Database schema and PostgreSQL integration
- Stockfish binary location/configuration
- Maia integration
- Web API and frontend choice
- Full player-style feature set