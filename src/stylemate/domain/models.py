from dataclasses import dataclass
from enum import StrEnum


class MoveLabel(StrEnum):
    BRILLIANT = "brilliant"
    GOOD = "good"
    INACCURACY = "inaccuracy"
    MISTAKE = "mistake"
    BLUNDER = "blunder"


@dataclass(frozen=True)
class MoveAnalysis:
    move_number: int
    move_uci: str
    centipawn_loss: int
    label: MoveLabel