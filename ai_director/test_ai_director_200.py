from __future__ import annotations

import pytest

from .brain import create_project_brain, ProductionConstitution, validate_constitution
from .dag_compiler import compile_production_dag
from .router_registry import CapabilityRouter
from .media_worker import MediaWorkerPipeline, RenderJobRequest
from .repair_manager import RepairManager, QualityProfile
from .models import QCReport, QCFinding


def test_project_brain_creation():
    brain = create_project_brain("proj_1", "Test Project", "A sci-fi journey across stars")
    assert brain.project_id == "proj_1"
    assert len(brain.entities) > 0
    assert len(brain.events) > 0


def test_constitution_validation():
    const = ProductionConstitution(constitution_id="const_1", tone="Dark Cyberpunk", adaptation_mode="faithful")
    warnings = validate_constitution(const)
    assert len(warnings) == 0


def test_dag_compilation():
    brain = create_project_brain("proj_1", "Test Project", "A sci-fi journey across stars")
    const = ProductionConstitution(constitution_id="const_1")
    result = compile_production_dag("proj_1", brain, const)
    assert result.success
    assert len(result.scenes) > 0
    assert len(result.nodes) > 0


def test_capability_router():
    router = CapabilityRouter()
    route = router.select_route("video_generation", privacy_tier="standard", require_continuity=True)
    assert route is not None
    assert route.capability == "video_generation"
    assert route.health_status == "healthy"


def test_media_worker_plan():
    worker = MediaWorkerPipeline()
    req = RenderJobRequest(job_id="job_1", project_id="proj_1", input_video_urls=["http://example.com/clip1.mp4"])
    plan = worker.build_render_plan(req)
    assert plan["job_id"] == "job_1"
    assert plan["inputs_count"] == 1


def test_repair_manager_flow():
    manager = RepairManager(QualityProfile("balanced", max_repair_attempts=2))
    finding = QCFinding(category="identity", severity="blocker", message="Character identity drift", repair_action="regenerate_shot")
    report = QCReport(report_id="rep_1", subject_id="shot_1", passed=False, score=0.4, findings=[finding])
    attempt = manager.evaluate_and_plan_repair("shot_1", report, current_attempts=0)
    assert attempt is not None
    assert attempt.strategy == "regenerate_shot"
