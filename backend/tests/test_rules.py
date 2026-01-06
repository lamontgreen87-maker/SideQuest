import random

import pytest

from rules import ability_mod, parse_dice, roll_dice


def test_parse_dice_valid():
    count, sides, bonus = parse_dice("2d6+3")
    assert count == 2
    assert sides == 6
    assert bonus == 3


def test_parse_dice_invalid():
    with pytest.raises(ValueError):
        parse_dice("bad")


def test_ability_mod():
    assert ability_mod(10) == 0
    assert ability_mod(12) == 1
    assert ability_mod(8) == -1


def test_roll_dice_bounds():
    random.seed(42)
    total, rolls, bonus = roll_dice("2d6+1")
    assert len(rolls) == 2
    assert all(1 <= roll <= 6 for roll in rolls)
    assert total == sum(rolls) + bonus
