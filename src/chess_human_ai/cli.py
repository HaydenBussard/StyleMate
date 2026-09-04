from __future__ import annotations

import argparse
from pathlib import Path

from chess_human_ai.services.pgn_inventory import inventory_pgn
from chess_human_ai.services.pgn_manifest import create_manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="chess-human-ai",
        description="Tools for analyzing and modeling human chess decisions.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add_inventory_command(subparsers)
    add_manifest_command(subparsers)

    args = parser.parse_args()

    if args.command == "inventory":
        result = inventory_pgn(args.pgn_path)
        print_inventory(result)

    elif args.command == "manifest":
        games_written = create_manifest(args.pgn_path, args.output)
        print_manifest_summary(
            pgn_path=args.pgn_path,
            output_path=args.output,
            games_written=games_written,
        )


def add_inventory_command(subparsers) -> None:
    inventory_parser = subparsers.add_parser(
        "inventory",
        help="Summarize a PGN archive.",
    )
    inventory_parser.add_argument(
        "pgn_path",
        type=Path,
        help="Path to a PGN file.",
    )


def add_manifest_command(subparsers) -> None:
    manifest_parser = subparsers.add_parser(
        "manifest",
        help="Create a one-row-per-game CSV manifest from a PGN archive.",
    )
    manifest_parser.add_argument(
        "pgn_path",
        type=Path,
        help="Path to a PGN file.",
    )
    manifest_parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("data/processed/game_manifest.csv"),
        help=(
            "CSV output path. "
            "Default: data/processed/game_manifest.csv"
        ),
    )


def print_inventory(result) -> None:
    print("\nPGN inventory")
    print("-------------")
    print(f"Games found: {result.total_games}")
    print(f"Games parsed: {result.parsed_games}")
    print(f"Games skipped: {result.skipped_games}")

    if result.dates:
        print(f"Date range: {min(result.dates)} to {max(result.dates)}")

    print("\nYour colors")
    print(f"As White: {result.white_games}")
    print(f"As Black: {result.black_games}")

    print("\nResults")
    print(f"Wins: {result.wins}")
    print(f"Losses: {result.losses}")
    print(f"Draws: {result.draws}")
    print(f"Unknown: {result.unknown_results}")

    print("\nTime controls")
    for time_control, count in result.time_controls.most_common():
        print(f"{time_control}: {count}")


def print_manifest_summary(
    pgn_path: Path,
    output_path: Path,
    games_written: int,
) -> None:
    print("\nManifest created")
    print("----------------")
    print(f"Input PGN: {pgn_path}")
    print(f"Output CSV: {output_path}")
    print(f"Games written: {games_written}")