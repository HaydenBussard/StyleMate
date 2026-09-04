from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import chess.pgn

from chess_human_ai.services.pgn_inventory import is_hayden


@dataclass(frozen=True)
class GameRecord:
    game_id: int
    date: str
    white: str
    black: str
    your_color: str
    opponent: str
    result: str
    time_control: str
    move_count: int


def result_for_player(
    pgn_result: str,
    played_white: bool,
    played_black: bool,
) -> str:
    if pgn_result == "1/2-1/2":
        return "draw"

    if pgn_result == "*":
        return "unknown"

    if (pgn_result == "1-0" and played_white) or (
        pgn_result == "0-1" and played_black
    ):
        return "win"

    if (pgn_result == "0-1" and played_white) or (
        pgn_result == "1-0" and played_black
    ):
        return "loss"

    return "unknown"


def create_manifest(pgn_path: Path, output_path: Path) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    game_count = 0

    with (
        pgn_path.open("r", encoding="utf-8-sig", errors="replace") as input_file,
        output_path.open("w", encoding="utf-8", newline="") as output_file,
    ):
        writer = csv.DictWriter(
            output_file,
            fieldnames=[
                "game_id",
                "date",
                "white",
                "black",
                "your_color",
                "opponent",
                "result",
                "time_control",
                "move_count",
            ],
        )
        writer.writeheader()

        while game := chess.pgn.read_game(input_file):
            game_count += 1
            headers = game.headers

            white = headers.get("White", "")
            black = headers.get("Black", "")
            played_white = is_hayden(white)
            played_black = is_hayden(black)

            if not played_white and not played_black:
                continue

            your_color = "white" if played_white else "black"
            opponent = black if played_white else white
            move_count = sum(1 for _ in game.mainline_moves())

            record = GameRecord(
                game_id=game_count,
                date=headers.get("Date", ""),
                white=white,
                black=black,
                your_color=your_color,
                opponent=opponent,
                result=result_for_player(
                    headers.get("Result", "*"),
                    played_white,
                    played_black,
                ),
                time_control=headers.get("TimeControl", "Unknown"),
                move_count=move_count,
            )

            writer.writerow(record.__dict__)

    return game_count