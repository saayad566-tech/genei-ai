"""The execution layer must not fabricate.

A mock provider that returns `status: "completed"` with a URL that does not exist is
indistinguishable from a real one at the call site. These tests exist because that is
exactly what used to happen: `GENEI_MOCK_MODE` defaulted to "true", so the CLI reported a
completed film whose asset URLs pointed at storage.example.com.

Pillar 30 of the specification is "DO NOT FAKE CAPABILITY". These are its tests.
"""
import pytest

from ai_director.config import Config
from ai_director.providers import (
    LocalRuntimeProvider,
    MockCloudProvider,
    MockLocalRunner,
    ProviderUnavailable,
    select_provider,
)


def test_mock_mode_is_off_by_default(monkeypatch):
    monkeypatch.delenv("GENEI_MOCK_MODE", raising=False)
    assert Config().mock_mode is False, "a default that fabricates results is worse than no default"


def test_a_run_with_no_runtime_refuses_rather_than_faking(monkeypatch):
    monkeypatch.delenv("GENEI_MOCK_MODE", raising=False)
    monkeypatch.delenv("GENEI_RUNTIME_URL", raising=False)
    with pytest.raises(ProviderUnavailable) as error:
        select_provider(Config())
    # The message must say what to do, not just that it failed.
    assert "GENEI_RUNTIME_URL" in str(error.value)


def test_a_mock_cannot_be_constructed_without_opting_in():
    with pytest.raises(ProviderUnavailable):
        MockCloudProvider()
    with pytest.raises(ProviderUnavailable):
        MockLocalRunner()
    # Opting in is possible, but it has to be explicit.
    assert MockCloudProvider(allow_mock=True).health() is True


def test_a_mock_is_never_selected_unless_mock_mode_is_on(monkeypatch):
    monkeypatch.setenv("GENEI_RUNTIME_URL", "http://127.0.0.1:3000")
    provider = select_provider(Config())
    assert isinstance(provider, LocalRuntimeProvider)
    assert provider.real is True, "a real runtime must be marked real"


def test_mock_mode_still_works_when_asked_for(monkeypatch):
    monkeypatch.delenv("GENEI_RUNTIME_URL", raising=False)
    provider = select_provider(Config(mock_mode=True))
    assert provider.real is False


def test_a_local_runtime_with_no_url_is_rejected():
    with pytest.raises(ProviderUnavailable):
        LocalRuntimeProvider(base_url="")


def test_an_unreachable_runtime_raises_instead_of_returning_nothing():
    provider = LocalRuntimeProvider(base_url="http://127.0.0.1:9", timeout_seconds=2)
    with pytest.raises(ProviderUnavailable):
        provider.submit_job("video", {})
    assert provider.health() is False


def test_the_project_records_how_it_ran(monkeypatch):
    from ai_director.models import Project
    monkeypatch.setenv("GENEI_MOCK_MODE", "true")
    monkeypatch.delenv("GENEI_RUNTIME_URL", raising=False)
    from ai_director.orchestration import PipelineOrchestrator

    project = Project(id="t", title="T", brief="A brief")
    assert project.execution_mode == "unrun"
    result = PipelineOrchestrator(Config(mock_mode=True)).run_project(project)
    # A mock run says so, so nothing downstream can imply it was real.
    assert result.execution_mode == "mock"
