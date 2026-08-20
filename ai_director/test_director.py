import pytest
from ai_director.models import Project
from ai_director.config import Config
from ai_director.director import AIDirector
from ai_director.voice import VoiceDirector
from ai_director.video import VideoOrchestrator
from ai_director.quality import EllipseScanQA
from ai_director.providers import MockCloudProvider
from ai_director.orchestration import PipelineOrchestrator

def test_script_decomposition():
    project = Project(id="test-1", title="Test", brief="A cyberpunk runner in neon alleyways.")
    director = AIDirector(project)
    updated = director.decompose_brief()
    assert len(updated.scenes) == 1
    assert len(updated.scenes[0].shots) == 2
    assert updated.status == "scripted"

def test_voice_synthesis():
    project = Project(id="test-2", title="Test", brief="Test brief")
    director = AIDirector(project)
    project = director.decompose_brief()
    voice_dir = VoiceDirector()
    audio = voice_dir.synthesize_scene_audio(project.scenes[0])
    assert audio.startswith("file://")

def test_video_orchestration_and_qa():
    project = Project(id="test-3", title="Test", brief="Test brief")
    director = AIDirector(project)
    project = director.decompose_brief()
    provider = MockCloudProvider()
    video_orch = VideoOrchestrator(provider)
    qa = EllipseScanQA()

    shot = project.scenes[0].shots[0]
    video_orch.generate_shot(shot)
    assert shot.status == "generated"
    assert shot.asset_url is not None

    report = qa.verify_shot(shot)
    assert report["passed"] is True
    assert shot.status == "approved"

def test_full_pipeline_orchestration():
    project = Project(id="test-4", title="Integration Test", brief="A historic documentary segment.")
    config = Config(policy="cloud_only")
    orch = PipelineOrchestrator(config)
    result = orch.run_project(project)
    assert result.status == "completed"
    assert len(result.scenes) > 0
    assert result.scenes[0].final_video_url is not None
