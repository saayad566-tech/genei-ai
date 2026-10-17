"""Take selection.

The specification's rule, verbatim in structure:

    Shot 017
      Take 1 -> FAIL
      Take 2 -> 71
      Take 3 -> 89  <- selected
      Take 4 -> 76

    Automatically select the best approved take according to reviewer score, continuity,
    technical quality and Director requirements. Keep all provenance. Never overwrite
    previous takes.

Two things this module is strict about:

* A take the reviewer could not judge (``UNKNOWN``) is **not** eligible. Treating "we do
  not know" as "fine" is how a bad take reaches a final cut.
* Selection returns a decision; it never mutates or deletes a take. Every take stays in
  the record with its own provenance, whatever is chosen.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional


ELIGIBLE_REVIEW_STATUSES = ("PASS",)


@dataclass
class Take:
    """One attempt at a shot. Append-only: nothing in this module rewrites a take."""

    id: str
    shot_id: str
    index: int
    asset_url: str
    reviewer_status: str = "UNKNOWN"  # PASS | REVISE | FAIL | UNKNOWN
    reviewer_score: Optional[int] = None
    # Facts read from the file by the deterministic validator, not opinions.
    technical_valid: bool = False
    technical: Dict[str, object] = field(default_factory=dict)
    continuity_score: Optional[float] = None
    requirements_met: List[str] = field(default_factory=list)
    requirements_failed: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    provenance: Dict[str, object] = field(default_factory=dict)

    def eligibility(self, required: Optional[List[str]] = None) -> List[str]:
        """Why this take cannot be selected. Empty means it can."""
        reasons: List[str] = []
        if self.reviewer_status not in ELIGIBLE_REVIEW_STATUSES:
            reasons.append(f"reviewer status is {self.reviewer_status}, not PASS")
        if not self.technical_valid:
            reasons.append("the deterministic validator did not accept the file")
        if self.reviewer_status == "PASS" and self.reviewer_score is None:
            reasons.append("the reviewer passed it without giving a score")
        for requirement in required or []:
            if requirement in self.requirements_failed:
                reasons.append(f"failed the Director requirement: {requirement}")
            elif requirement not in self.requirements_met:
                reasons.append(f"did not evidence the Director requirement: {requirement}")
        return reasons


@dataclass
class RankedTake:
    take_id: str
    score: float
    reviewer_score: Optional[int]
    continuity_score: Optional[float]
    reasons: List[str] = field(default_factory=list)


@dataclass
class TakeSelection:
    shot_id: str
    selected_take_id: Optional[str]
    ranked: List[RankedTake]
    rejected: Dict[str, List[str]]
    all_takes_preserved: int
    explanation: str


def _score(take: Take) -> float:
    """Rank a take. Reviewer score dominates, then continuity, then technical detail.

    The weights are explicit rather than hidden so a Director can see why one take beat
    another, and so they can be argued with.
    """
    reviewer = float(take.reviewer_score or 0) * 0.7
    continuity = float(take.continuity_score if take.continuity_score is not None else 0.0) * 10.0 * 0.2
    technical = 10.0 if take.technical_valid else 0.0
    # Reward evidence that stated requirements were actually met.
    evidence = min(len(take.requirements_met), 5) * 1.0
    return round(reviewer + continuity + technical + evidence, 3)


def select_take(
    takes: List[Take],
    *,
    required_requirements: Optional[List[str]] = None,
) -> TakeSelection:
    """Choose the best eligible take for a shot, keeping every take in the record."""
    if not takes:
        return TakeSelection(
            shot_id="",
            selected_take_id=None,
            ranked=[],
            rejected={},
            all_takes_preserved=0,
            explanation="No takes were supplied, so nothing could be selected.",
        )

    shot_id = takes[0].shot_id
    mixed = [take for take in takes if take.shot_id != shot_id]
    if mixed:
        raise ValueError("select_take received takes from more than one shot")

    rejected: Dict[str, List[str]] = {}
    eligible: List[Take] = []
    for take in takes:
        reasons = take.eligibility(required_requirements)
        if reasons:
            rejected[take.id] = reasons
        else:
            eligible.append(take)

    ranked = sorted(
        (
            RankedTake(
                take_id=take.id,
                score=_score(take),
                reviewer_score=take.reviewer_score,
                continuity_score=take.continuity_score,
            )
            for take in eligible
        ),
        key=lambda entry: entry.score,
        reverse=True,
    )

    if not ranked:
        return TakeSelection(
            shot_id=shot_id,
            selected_take_id=None,
            ranked=[],
            rejected=rejected,
            all_takes_preserved=len(takes),
            explanation=(
                f"None of the {len(takes)} take(s) is eligible. A take must pass the reviewer, pass the "
                "deterministic validator, carry a score, and evidence every Director requirement. This shot "
                "needs another attempt or a human decision — it is not silently accepted."
            ),
        )

    winner = ranked[0]
    runner_up = ranked[1] if len(ranked) > 1 else None
    margin = "" if runner_up is None else f" (next best {runner_up.score}, margin {round(winner.score - runner_up.score, 3)})"
    return TakeSelection(
        shot_id=shot_id,
        selected_take_id=winner.take_id,
        ranked=ranked,
        rejected=rejected,
        all_takes_preserved=len(takes),
        explanation=f"Selected {winner.take_id} with score {winner.score}{margin}. All {len(takes)} take(s) are kept.",
    )


def append_take(existing: List[Take], new_take: Take) -> List[Take]:
    """Add a take without touching the ones already recorded.

    Returns a new list. If the id already exists this raises rather than replacing it,
    because overwriting a take destroys the record of what was actually produced.
    """
    if any(take.id == new_take.id for take in existing):
        raise ValueError(f"take {new_take.id} already exists; takes are append-only and must not be overwritten")
    if any(take.shot_id == new_take.shot_id and take.index == new_take.index for take in existing):
        raise ValueError(f"shot {new_take.shot_id} already has a take at index {new_take.index}")
    return [*existing, new_take]


def summarise_takes(takes: List[Take]) -> List[dict]:
    """A compact, ordered view for a UI or a report."""
    return [
        {
            "take_id": take.id,
            "index": take.index,
            "reviewer_status": take.reviewer_status,
            "reviewer_score": take.reviewer_score,
            "technical_valid": take.technical_valid,
            "continuity_score": take.continuity_score,
            "requirements_failed": list(take.requirements_failed),
            "asset_url": take.asset_url,
        }
        for take in sorted(takes, key=lambda item: item.index)
    ]
