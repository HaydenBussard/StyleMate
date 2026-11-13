from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import chess.pgn


@dataclass(frozen=True)
class PgnInventory:
    total_games: int
    parsed_games: int
    skipped_games: int
    white_games: int
    black_games: int
    wins: int
    losses: int
    draws: int
    unknown_results: int
    time_controls: Counter[str]
    dates: list[str]


PLAYER_NAMES_ENV = "CHESS_HUMAN_AI_PLAYERS"


def player_names() -> set[str]:
    """Names (case-insensitive) that count as "you" in a PGN.

    Read from the CHESS_HUMAN_AI_PLAYERS environment variable, comma-separated,
    e.g. CHESS_HUMAN_AI_PLAYERS="myLichessName,My Real Name". Kept out of the
    code so the public source never contains personal account names.
    """
    raw = os.environ.get(PLAYER_NAMES_ENV, "")
    return {n.strip().lower() for n in raw.split(",") if n.strip()}


def is_player(name: str) -> bool:
    return name.strip().lower() in player_names()


def inventory_pgn(pgn_path: Path) -> PgnInventory:
    total_games = 0
    parsed_games = 0
    skipped_games = 0
    white_games = 0
    black_games = 0
    wins = 0
    losses = 0
    draws = 0
    unknown_results = 0
    time_controls: Counter[str] = Counter()
    dates: list[str] = []

    with pgn_path.open("r", encoding="utf-8-sig", errors="replace") as handle:
        while True:
            game = chess.pgn.read_game(handle)

            if game is None:
                break

            total_games += 1
            headers = game.headers

            white = headers.get("White", "")
            black = headers.get("Black", "")
            result = headers.get("Result", "*")
            time_control = headers.get("TimeControl", "Unknown")
            date = headers.get("Date", "")

            if not white and not black:
                skipped_games += 1
                continue

            parsed_games += 1
            time_controls[time_control] += 1

            if date and date != "????.??.??":
                dates.append(date)

            played_white = is_player(white)
            played_black = is_player(black)

            if played_white:
                white_games += 1
            elif played_black:
                black_games += 1

            if result == "1/2-1/2":
                draws += 1
            elif result == "*":
                unknown_results += 1
            elif (result == "1-0" and played_white) or (
                result == "0-1" and played_black
            ):
                wins += 1
            elif (result == "0-1" and played_white) or (
                result == "1-0" and played_black
            ):
                losses += 1

    return PgnInventory(
        total_games=total_games,
        parsed_games=parsed_games,
        skipped_games=skipped_games,
        white_games=white_games,
        black_games=black_games,
        wins=wins,
        losses=losses,
        draws=draws,
        unknown_results=unknown_results,
        time_controls=time_controls,
        dates=dates,
    )