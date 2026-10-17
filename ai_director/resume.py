"""Resumable production.

The specification's requirement, in its own words:

    Use resumable production.
    If the computer shuts down after Shot 437:
    On restart: Resume from Shot 438.
    Do not regenerate approved shots.

Approved work is expensive — a shot that took minutes to render must never be rendered
again because a process restarted. This module decides what still needs doing and what
must be left alone, from the recorded state alone (no side effects, no mutation).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from .models import Project, Shot

# A shot in one of these states is finished and must not be regenerated.
APPROVED_STATES = ("approved",)

# A shot in one of these states has media but is not accepted yet: it goes back to
# review, not back to generation.
AWAITING_REVIEW_STATES = ("generated", "needs_review")


@dataclass
class ResumePlan:
    project_id: str
    """The next shot to work on, or None when the production is complete."""
    next_shot_id: Optional[str]
    """Ordered ids of shots that are already approved and will be skipped."""
    skip_approved: List[str] = field(default_factory=list)
    """Ordered ids of shots that have media but still need a review decision."""
    review_pending: List[str] = field(default_factory=list)
    """Ordered ids of shots that must actually be generated."""
    generate_pending: List[str] = field(default_factory=list)
    """Ordered ids of shots that previously failed and should be retried."""
    retry_pending: List[str] = field(default_factory=list)
    explanation: str = ""


def _ordered_shots(project: Project) -> List[Shot]:
    """Every shot in the project, in the order the film plays."""
    shots: List[Shot] = []
    for scene in sorted(project.scenes, key=lambda item: item.scene_index):
        shots.extend(sorted(scene.shots, key=lambda item: item.sequence_index))
    return shots


def plan_resume(project: Project) -> ResumePlan:
    """Work out what remains, without touching anything."""
    shots = _ordered_shots(project)
    if not shots:
        return ResumePlan(project_id=project.id, next_shot_id=None, explanation="The project has no shots yet, so there is nothing to resume.")

    skip_approved: List[str] = []
    review_pending: List[str] = []
    generate_pending: List[str] = []
    retry_pending: List[str] = []

    for shot in shots:
        if shot.status in APPROVED_STATES:
            skip_approved.append(shot.id)
        elif shot.status in AWAITING_REVIEW_STATES:
            review_pending.append(shot.id)
        elif shot.status == "failed":
            retry_pending.append(shot.id)
        else:
            generate_pending.append(shot.id)

    # The next shot is the first one that is not already approved.
    next_shot_id = next((shot.id for shot in shots if shot.status not in APPROVED_STATES), None)

    if next_shot_id is None:
        explanation = (
            f"All {len(shots)} shot(s) are approved. There is nothing to resume, and no approved shot will be regenerated."
        )
    else:
        explanation = (
            f"Resuming at {next_shot_id}: {len(skip_approved)} approved shot(s) will be skipped rather than regenerated, "
            f"{len(review_pending)} await a review decision, {len(generate_pending)} need generating, and {len(retry_pending)} are retries."
        )

    return ResumePlan(
        project_id=project.id,
        next_shot_id=next_shot_id,
        skip_approved=skip_approved,
        review_pending=review_pending,
        generate_pending=generate_pending,
        retry_pending=retry_pending,
        explanation=explanation,
    )


def is_complete(project: Project) -> bool:
    """True only when every shot in the project is approved."""
    shots = _ordered_shots(project)
    return bool(shots) and all(shot.status in APPROVED_STATES for shot in shots)
