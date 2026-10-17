"""Film Blueprint: the plan the whole production is fitted into."""
from ai_director.film_blueprint import (
    Beat,
    SequencePlan,
    blueprint_to_sequence_plan,
    create_film_blueprint,
    revise_film_blueprint,
    validate_film_blueprint,
)


def _valid_blueprint():
    return create_film_blueprint(
        "proj-1",
        "A lighthouse keeper who has not spoken to anyone in a year.",
        title="The Long Watch",
        logline="A keeper must choose between the light and the shore.",
        theme="Solitude and duty",
        tone="restrained, cold, hopeful at the end",
        visual_style="naturalistic, handheld, available light",
        target_duration_seconds=300,
        sequences=[
            SequencePlan(
                id="seq-1", title="The routine", act=1, objective="Establish the keeper's isolation",
                beats=[Beat(id="b1", summary="He tends the lamp", purpose="Show the ritual that fills his days")],
            ),
            SequencePlan(
                id="seq-2", title="The signal", act=2, objective="A ship answers, and he must decide",
                beats=[Beat(id="b2", summary="A reply arrives", purpose="Break the isolation and force the choice")],
            ),
            SequencePlan(
                id="seq-3", title="The shore", act=3, objective="He leaves, or he stays for good",
                beats=[Beat(id="b3", summary="He rows out", purpose="Resolve the choice the film set up")],
            ),
        ],
    )


def test_a_complete_blueprint_is_valid():
    assert validate_film_blueprint(_valid_blueprint()) == []


def test_a_blueprint_without_a_logline_is_rejected():
    blueprint = _valid_blueprint()
    blueprint.logline = ""
    problems = validate_film_blueprint(blueprint)
    assert any("logline is empty" in problem for problem in problems)


def test_a_blueprint_that_cannot_be_traced_to_the_idea_is_rejected():
    blueprint = _valid_blueprint()
    blueprint.derived_from_brief = "   "
    assert any("cannot be traced" in problem for problem in validate_film_blueprint(blueprint))


def test_an_act_with_no_sequence_is_reported_rather_than_silently_missing():
    blueprint = _valid_blueprint()
    blueprint.sequences = [sequence for sequence in blueprint.sequences if sequence.act != 2]
    problems = validate_film_blueprint(blueprint)
    assert any("act 2" in problem and "no sequence" in problem for problem in problems)


def test_a_sequence_outside_the_act_structure_is_rejected():
    blueprint = _valid_blueprint()
    blueprint.sequences[0].act = 9
    problems = validate_film_blueprint(blueprint)
    assert any("outside the declared act structure" in problem for problem in problems)


def test_a_sequence_without_an_objective_is_rejected():
    blueprint = _valid_blueprint()
    blueprint.sequences[0].objective = ""
    assert any("has no objective" in problem for problem in validate_film_blueprint(blueprint))


def test_a_beat_must_say_what_happens_and_why():
    blueprint = _valid_blueprint()
    blueprint.sequences[0].beats[0].purpose = ""
    assert any("has no purpose" in problem for problem in validate_film_blueprint(blueprint))


def test_a_zero_length_target_is_rejected():
    blueprint = _valid_blueprint()
    blueprint.target_duration_seconds = 0
    assert any("greater than zero" in problem for problem in validate_film_blueprint(blueprint))


def test_an_empty_blueprint_names_every_missing_part():
    blueprint = create_film_blueprint("proj-1", "", title="")
    problems = " | ".join(validate_film_blueprint(blueprint))
    # Each missing part is named individually rather than reported as one vague error.
    # (tone and visual_style carry structural defaults, so they are not among them.)
    for field in ("title", "logline", "theme", "cannot be traced", "sequences"):
        assert field in problems, f"{field} should be named as missing" 


def test_revision_never_overwrites_the_previous_plan():
    original = _valid_blueprint()
    revised = revise_film_blueprint(original, logline="A sharper logline.")
    assert original.logline != revised.logline
    assert original.version == 1
    assert revised.version == 2
    assert revised.revision_of == 1
    assert validate_film_blueprint(revised) == []


def test_revision_rejects_an_unknown_field():
    try:
        revise_film_blueprint(_valid_blueprint(), nonsense="x")
    except ValueError as error:
        assert "unknown blueprint field" in str(error)
    else:  # pragma: no cover - the call must raise
        raise AssertionError("revising an unknown field should raise")


def test_sequence_plan_is_ordered_by_act():
    blueprint = _valid_blueprint()
    ordered = blueprint_to_sequence_plan(blueprint)
    assert [entry["sequence_id"] for entry in ordered] == ["seq-1", "seq-2", "seq-3"]
    assert ordered[0]["beat_ids"] == ["b1"]
