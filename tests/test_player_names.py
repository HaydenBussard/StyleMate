from stylemate.services.pgn_inventory import PLAYER_NAMES_ENV, is_player


def test_no_names_configured_matches_nobody(monkeypatch) -> None:
    monkeypatch.delenv(PLAYER_NAMES_ENV, raising=False)
    assert not is_player("anyone")


def test_names_from_env_are_case_insensitive(monkeypatch) -> None:
    monkeypatch.setenv(PLAYER_NAMES_ENV, " Alice , bob_lichess ")
    assert is_player("alice")
    assert is_player("BOB_LICHESS ")
    assert not is_player("carol")


def test_legacy_env_name_still_works(monkeypatch) -> None:
    monkeypatch.delenv(PLAYER_NAMES_ENV, raising=False)
    monkeypatch.setenv("CHESS_HUMAN_AI_PLAYERS", "alice")
    assert is_player("alice")
