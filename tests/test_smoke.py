from stylemate.domain.models import MoveLabel


def test_move_label_value() -> None:
    assert MoveLabel.BLUNDER.value == "blunder"