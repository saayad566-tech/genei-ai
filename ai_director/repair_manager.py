from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import time

from .models import QCReport, QCFinding, RepairAttempt


@dataclass
class QualityProfile:
    profile_name: str  # draft, balanced, cinematic, strict_continuity, local_only
    min_passing_score: float = 0.70
    block_on_identity_mismatch: bool = True
    block_on_world_mismatch: bool = True
    max_repair_attempts: int = 3


class RepairManager:
    def __init__(self, profile: Optional[QualityProfile] = None) -> None:
        self.profile = profile or QualityProfile("balanced")

    def evaluate_and_plan_repair(self, subject_id: str, qc_report: QCReport, current_attempts: int) -> Optional[RepairAttempt]:
        if qc_report.passed:
            return None
        if current_attempts >= self.profile.max_repair_attempts:
            return None

        # Find first actionable finding
        target_finding: Optional[QCFinding] = None
        for finding in qc_report.findings:
            if finding.severity in {"error", "blocker"} and finding.repair_action:
                target_finding = finding
                break

        if not target_finding:
            target_finding = QCFinding("general", "warning", "General quality review required", repair_action="regenerate_shot")

        repair_id = f"repair_{int(time.time())}_{current_attempts + 1}"
        return RepairAttempt(
            repair_id=repair_id,
            subject_id=subject_id,
            reason=target_finding.message,
            strategy=target_finding.repair_action or "regenerate_shot",
            status="pending",
        )
