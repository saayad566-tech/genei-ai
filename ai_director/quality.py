from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional
import uuid

from .continuity import compare_transition
from .models import ContinuityPacket, QCFinding, QCReport, Shot


class EllipseScanQA:
    """Provider-neutral QC facade.

    It performs deterministic contract checks locally and leaves advanced vision/audio
    extraction to an optional BYOH analyzer. It never reports unavailable analysis as passed.
    """

    def _finding(self, category: str, severity: str, message: str, repair_action: str) -> QCFinding:
        return QCFinding(category, severity, message, confidence=0.9, repair_action=repair_action)

    def artifact_warnings(self, shot: Shot) -> List[QCFinding]:
        findings: List[QCFinding] = []
        if not shot.asset_url:
            findings.append(self._finding("technical", "blocker", "No generated media asset is attached to this shot.", "regenerate_shot"))
        if shot.start_continuity and shot.start_continuity.extraction_status == "not_available":
            findings.append(self._finding("temporal", "warning", "Start continuity was not analyzed; motion and pose may reset.", "run_boh_analyzer"))
        if shot.start_continuity:
            for warning in shot.start_continuity.warnings:
                findings.append(self._finding("continuity", "warning", warning, "inspect_continuity"))
        if not shot.provenance:
            findings.append(self._finding("provenance", "warning", "Provider/model provenance is missing, so this result is not reproducible.", "capture_provenance"))
        if shot.dialogue and not shot.start_continuity:
            findings.append(self._finding("audio", "warning", "Dialogue exists without an audio/lip-sync continuity cursor.", "align_audio"))
        return findings

    def verify_shot(self, shot: Shot) -> Dict[str, Any]:
        findings = self.artifact_warnings(shot)
        blockers = [f for f in findings if f.severity == "blocker"]
        score = max(0.0, 1.0 - 0.03 * len(findings) - 0.35 * len(blockers))
        passed = not blockers and score >= 0.8
        shot.qa_score = round(score, 3)
        shot.status = "approved" if passed else "needs_review"
        report = QCReport(
            report_id=f"qc_{uuid.uuid4().hex[:10]}",
            subject_id=shot.id,
            passed=passed,
            score=shot.qa_score,
            findings=findings,
        )
        shot.qc_reports.append(report)
        return {
            "shot_id": shot.id,
            "qa_score": shot.qa_score,
            "passed": passed,
            "findings": [f.__dict__ for f in findings],
            "reason": "No blocking findings." if passed else "Review artifact and continuity findings before approval.",
        }

    def verify_transition(self, previous: Shot, current: Shot) -> Dict[str, Any]:
        if not previous.end_continuity or not current.start_continuity:
            findings = [self._finding("continuity", "blocker", "Transition lacks an end/start continuity packet.", "regenerate_boundary")]
        else:
            findings = compare_transition(previous.end_continuity, current.start_continuity)
        blockers = [f for f in findings if f.severity == "blocker"]
        score = max(0.0, 1.0 - 0.2 * len(findings) - 0.35 * len(blockers))
        report = QCReport(
            report_id=f"transition_qc_{uuid.uuid4().hex[:10]}",
            subject_id=f"{previous.id}->{current.id}",
            passed=not blockers,
            score=round(score, 3),
            findings=findings,
            transition=True,
        )
        current.qc_reports.append(report)
        if blockers:
            current.status = "needs_review"
        return {
            "transition": report.subject_id,
            "passed": report.passed,
            "qa_score": report.score,
            "findings": [f.__dict__ for f in findings],
        }
