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


def test_byoh_capability_discovery(monkeypatch):
    from ai_director.runner_client import discover_capabilities

    monkeypatch.setenv("GENEI_FFMPEG", "ffmpeg")
    capabilities = discover_capabilities()
    assert "local-python" in capabilities
    assert "local-media-pipeline" in capabilities
    assert "ffmpeg" in capabilities


def test_linux_memory_probe(monkeypatch):
    import builtins
    from unittest.mock import mock_open
    import ai_director.runner_client as runner_client

    monkeypatch.setattr(runner_client.platform, "system", lambda: "Linux")
    monkeypatch.setattr(builtins, "open", mock_open(read_data="MemTotal:       16384000 kB\n"))
    assert runner_client._memory_mb() == 16000


def test_macos_memory_and_gpu_probe(monkeypatch):
    import json
    import ai_director.runner_client as runner_client

    monkeypatch.setattr(runner_client.platform, "system", lambda: "Darwin")
    responses = iter(["17179869184", json.dumps({"SPDisplaysDataType": [{"sppci_model": "Apple M GPU", "spdisplays_vram": "8192 MB"}]})])
    monkeypatch.setattr(runner_client, "_run_probe", lambda args, timeout=8: next(responses))
    assert runner_client._memory_mb() == 16384
    gpus = runner_client._mac_gpus()
    assert gpus[0]["name"] == "Apple M GPU"
    assert gpus[0]["vram_mb"] == "8192"


def test_windows_memory_and_gpu_probe(monkeypatch):
    import json
    import ai_director.runner_client as runner_client

    monkeypatch.setattr(runner_client.platform, "system", lambda: "Windows")
    monkeypatch.setattr(runner_client.shutil, "which", lambda name: "pwsh" if name in {"pwsh", "powershell"} else None)
    responses = iter(["34359738368", json.dumps({"Name": "Windows Test GPU", "AdapterRAM": 17179869184})])
    monkeypatch.setattr(runner_client, "_run_probe", lambda args, timeout=8: next(responses))
    assert runner_client._memory_mb() == 32768
    gpus = runner_client._windows_gpus()
    assert gpus[0]["name"] == "Windows Test GPU"
    assert gpus[0]["vram_mb"] == "16384"


def test_gpu_probe_falls_back_when_nvidia_tool_is_unavailable(monkeypatch):
    import ai_director.runner_client as runner_client

    monkeypatch.setattr(runner_client.shutil, "which", lambda name: None)
    assert runner_client._nvidia_gpus() == []
