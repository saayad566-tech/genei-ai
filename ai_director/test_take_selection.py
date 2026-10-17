"""Take selection: the specification's Shot 017 example, enforced."""
from ai_director.take_selection import Take, append_take, select_take, summarise_takes


def _take(index, *, status="PASS", score=70, technical=True, continuity=0.5, met=None, failed=None):
    return Take(
        id=f"t{index}",
        shot_id="shot-017",
        index=index,
        asset_url=f"file:///takes/shot-017-take{index}.mp4",
        reviewer_status=status,
        reviewer_score=score,
        technical_valid=technical,
        continuity_score=continuity,
        requirements_met=met or [],
        requirements_failed=failed or [],
    )


def test_selects_the_highest_scoring_approved_take():
    # The spec's example: Take 1 FAIL, Take 2 71, Take 3 89, Take 4 76.
    takes = [
        _take(1, status="FAIL", score=0),
        _take(2, score=71),
        _take(3, score=89),
        _take(4, score=76),
    ]
    selection = select_take(takes)
    assert selection.selected_take_id == "t3"
    assert [entry.take_id for entry in selection.ranked] == ["t3", "t4", "t2"]


def test_a_failed_take_is_rejected_with_its_reason():
    selection = select_take([_take(1, status="FAIL", score=0), _take(2, score=80)])
    assert "t1" in selection.rejected
    assert any("not PASS" in reason for reason in selection.rejected["t1"])
    assert selection.selected_take_id == "t2"


def test_an_unknown_review_is_never_treated_as_a_pass():
    # This is the rule that keeps an unjudged take out of a final cut.
    selection = select_take([_take(1, status="UNKNOWN", score=None)])
    assert selection.selected_take_id is None
    assert "unknown" in selection.explanation.lower() or "not silently accepted" in selection.explanation


def test_a_take_that_failed_the_validator_is_not_selectable():
    selection = select_take([_take(1, score=95, technical=False)])
    assert selection.selected_take_id is None
    assert any("deterministic validator" in reason for reason in selection.rejected["t1"])


def test_a_pass_without_a_score_is_not_selectable():
    selection = select_take([_take(1, status="PASS", score=None)])
    assert selection.selected_take_id is None
    assert any("without giving a score" in reason for reason in selection.rejected["t1"])


def test_director_requirements_must_be_evidenced():
    takes = [_take(1, score=90, met=["no_hat"]), _take(2, score=60, met=["no_hat", "same_wardrobe"])]
    selection = select_take(takes, required_requirements=["no_hat", "same_wardrobe"])
    # Take 1 scores higher but does not evidence every requirement, so it cannot win.
    assert selection.selected_take_id == "t2"
    assert any("did not evidence" in reason for reason in selection.rejected["t1"])


def test_an_explicitly_failed_requirement_is_reported_as_failed():
    selection = select_take([_take(1, score=99, failed=["same_wardrobe"])], required_requirements=["same_wardrobe"])
    assert any("failed the Director requirement" in reason for reason in selection.rejected["t1"])


def test_every_take_is_preserved_whatever_is_chosen():
    takes = [_take(1, status="FAIL", score=0), _take(2, score=88), _take(3, status="UNKNOWN")]
    selection = select_take(takes)
    assert selection.all_takes_preserved == 3
    assert len(takes) == 3
    # Nothing was removed or rewritten by selecting.
    assert [take.id for take in takes] == ["t1", "t2", "t3"]


def test_no_takes_at_all_is_reported_plainly():
    selection = select_take([])
    assert selection.selected_take_id is None
    assert "No takes were supplied" in selection.explanation


def test_takes_from_more_than_one_shot_are_refused():
    mixed = [_take(1), Take(id="other", shot_id="shot-018", index=1, asset_url="x")]
    try:
        select_take(mixed)
    except ValueError as error:
        assert "more than one shot" in str(error)
    else:  # pragma: no cover - the call must raise
        raise AssertionError("mixing shots should raise")


def test_appending_keeps_the_earlier_takes():
    takes = [_take(1, score=70)]
    grown = append_take(takes, _take(2, score=80))
    assert len(takes) == 1
    assert [take.id for take in grown] == ["t1", "t2"]


def test_a_take_cannot_be_overwritten():
    takes = [_take(1)]
    try:
        append_take(takes, _take(1, score=99))
    except ValueError as error:
        assert "append-only" in str(error)
    else:  # pragma: no cover - the call must raise
        raise AssertionError("overwriting a take should raise")


def test_a_shot_cannot_reuse_a_take_index():
    takes = [_take(1)]
    duplicate_index = Take(id="different-id", shot_id="shot-017", index=1, asset_url="x")
    try:
        append_take(takes, duplicate_index)
    except ValueError as error:
        assert "already has a take at index" in str(error)
    else:  # pragma: no cover - the call must raise
        raise AssertionError("reusing an index should raise")


def test_summary_is_ordered_by_take_index():
    summary = summarise_takes([_take(3), _take(1), _take(2)])
    assert [entry["index"] for entry in summary] == [1, 2, 3]


def test_continuity_breaks_a_tie_between_equal_reviewer_scores():
    takes = [_take(1, score=80, continuity=0.2), _take(2, score=80, continuity=0.9)]
    assert select_take(takes).selected_take_id == "t2"
