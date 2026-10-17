"""Resumable production: approved shots are never regenerated."""
from ai_director.models import Project, Scene, Shot
from ai_director.resume import is_complete, plan_resume


def _project(statuses):
    """Build a project whose shots carry the given statuses, in order."""
    scenes = []
    for scene_index, group in enumerate([statuses]):
        shots = [
            Shot(id=f"shot-{index + 1:03d}", scene_id="scene-1", sequence_index=index, prompt="p", status=status)
            for index, status in enumerate(group)
        ]
        scenes.append(Scene(id="scene-1", scene_index=scene_index, title="S", objective="o", location="l", time_of_day="day", shots=shots))
    return Project(id="proj-1", title="T", brief="b", scenes=scenes)


def test_resumes_at_the_first_shot_that_is_not_approved():
    # The spec's example: everything up to shot 437 approved, 438 onward not.
    statuses = ["approved"] * 5 + ["pending", "pending"]
    plan = plan_resume(_project(statuses))
    assert plan.next_shot_id == "shot-006"


def test_approved_shots_are_skipped_not_regenerated():
    statuses = ["approved", "approved", "pending"]
    plan = plan_resume(_project(statuses))
    assert plan.skip_approved == ["shot-001", "shot-002"]
    assert "shot-001" not in plan.generate_pending
    assert "shot-002" not in plan.generate_pending


def test_a_generated_shot_goes_back_to_review_not_to_generation():
    plan = plan_resume(_project(["approved", "generated"]))
    assert plan.review_pending == ["shot-002"]
    assert "shot-002" not in plan.generate_pending


def test_a_failed_shot_is_marked_for_retry():
    plan = plan_resume(_project(["approved", "failed", "pending"]))
    assert plan.retry_pending == ["shot-002"]
    assert plan.generate_pending == ["shot-003"]


def test_a_fully_approved_project_is_complete_and_has_nothing_to_resume():
    project = _project(["approved", "approved", "approved"])
    plan = plan_resume(project)
    assert plan.next_shot_id is None
    assert is_complete(project) is True
    assert "no approved shot will be regenerated" in plan.explanation


def test_an_empty_project_is_reported_rather_than_treated_as_done():
    project = Project(id="proj-2", title="T", brief="b")
    plan = plan_resume(project)
    assert plan.next_shot_id is None
    assert is_complete(project) is False
    assert "nothing to resume" in plan.explanation


def test_shots_are_ordered_by_scene_then_sequence():
    first = Scene(id="s1", scene_index=0, title="A", objective="o", location="l", time_of_day="day",
                  shots=[Shot(id="a1", scene_id="s1", sequence_index=0, prompt="p", status="approved")])
    second = Scene(id="s2", scene_index=1, title="B", objective="o", location="l", time_of_day="day",
                   shots=[Shot(id="b1", scene_id="s2", sequence_index=0, prompt="p", status="pending")])
    project = Project(id="proj-3", title="T", brief="b", scenes=[second, first])
    plan = plan_resume(project)
    # Ordered by scene_index even though the list is out of order.
    assert plan.skip_approved == ["a1"]
    assert plan.next_shot_id == "b1"


def test_the_explanation_states_the_counts():
    plan = plan_resume(_project(["approved", "generated", "pending", "failed"]))
    assert "1 approved" in plan.explanation
    assert "1 await a review decision" in plan.explanation
    assert "1 need generating" in plan.explanation
    assert "1 are retries" in plan.explanation
