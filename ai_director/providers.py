"""Capability providers for the Genei AI execution layer.

The distinction this module exists to enforce:

  * ``LocalRuntimeProvider`` — REAL. It calls an actual local runtime over HTTP and
    reports what that runtime actually returned.
  * ``MockCloudProvider`` / ``MockLocalRunner`` — FABRICATIONS. They return
    ``status: "completed"`` with URLs that do not exist. They are kept for tests only,
    and they now refuse to run unless mock mode was explicitly switched on.

Previously the orchestrator selected a mock by default (``GENEI_MOCK_MODE`` defaulted to
"true") and the CLI is a real entry point, so ``python -m ai_director.cli`` reported a
completed film whose asset URLs pointed at ``storage.example.com``. That is a fabricated
success, and the specification forbids it outright ("DO NOT FAKE CAPABILITY").

A provider that cannot reach a runtime must fail. It must never substitute a plausible
answer, because a plausible answer is indistinguishable from a real one at the call site.
"""
from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from urllib import error as urlerror
from urllib import request as urlrequest


class ProviderUnavailable(RuntimeError):
    """Raised when no real runtime can be reached.

    Deliberately an exception rather than an empty result: a caller must not be able to
    mistake "nothing ran" for "something ran".
    """


class CapabilityProvider(ABC):
    #: True only for providers that return real, externally produced results.
    real: bool = False

    @abstractmethod
    def health(self) -> bool:
        ...

    @abstractmethod
    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        ...

    @abstractmethod
    def poll_job(self, job_id: str) -> Dict[str, Any]:
        ...


class LocalRuntimeProvider(CapabilityProvider):
    """Calls a real local runtime over HTTP.

    The runtime is the Genei server's execution plane, which drives ComfyUI, llama.cpp and
    FFmpeg on this machine. This provider is a thin, honest transport: it forwards the
    request and returns exactly what came back. It never invents an output URL.
    """

    real = True

    def __init__(self, base_url: str, token: Optional[str] = None, timeout_seconds: int = 120) -> None:
        if not base_url:
            raise ProviderUnavailable(
                "No local runtime URL is configured. Set GENEI_RUNTIME_URL to the Genei "
                "server's execution endpoint, or start the runtime before generating."
            )
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8")
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        request = urlrequest.Request(url, data=data, headers=headers, method="POST")
        try:
            with urlrequest.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except urlerror.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise ProviderUnavailable(f"The local runtime answered HTTP {exc.code}: {detail}") from exc
        except (urlerror.URLError, OSError) as exc:
            raise ProviderUnavailable(
                f"The local runtime at {self.base_url} could not be reached: {exc}. "
                "Generation cannot proceed without it."
            ) from exc
        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise ProviderUnavailable(f"The local runtime returned a body that is not JSON: {raw[:200]}") from exc

    def health(self) -> bool:
        try:
            self._post("/api/trpc/adapters.selfTest", {"json": {}})
            return True
        except ProviderUnavailable:
            return False

    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._post("/api/trpc/adapters.submit", {"json": {"taskType": task_type, "payload": payload}})

    def poll_job(self, job_id: str) -> Dict[str, Any]:
        return self._post("/api/trpc/adapters.poll", {"json": {"jobId": job_id}})


class _FabricatingProvider(CapabilityProvider):
    """Base for the test doubles. Refuses to run unless mock mode is explicitly enabled."""

    real = False
    label = "a mock provider"

    def __init__(self, allow_mock: bool = False) -> None:
        if not allow_mock:
            raise ProviderUnavailable(
                f"{self.label} was selected but mock mode is off. Mock providers return "
                "fabricated results, so they are never used for a real run. Set "
                "GENEI_MOCK_MODE=true only for tests."
            )

    def health(self) -> bool:
        return True


class MockCloudProvider(_FabricatingProvider):
    """Test double. Returns a fabricated completion with a URL that does not exist."""

    label = "MockCloudProvider"

    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"job_id": f"cloud-{task_type}-123", "status": "completed", "output_url": f"https://storage.example.com/{task_type}-out.mp4"}

    def poll_job(self, job_id: str) -> Dict[str, Any]:
        return {"job_id": job_id, "status": "completed", "output_url": "https://storage.example.com/mock-out.mp4"}


class MockLocalRunner(_FabricatingProvider):
    """Test double. Returns a fabricated completion with a file URL that does not exist."""

    label = "MockLocalRunner"

    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"job_id": f"local-{task_type}-456", "status": "completed", "output_url": f"file://./output/{task_type}-local.mp4"}

    def poll_job(self, job_id: str) -> Dict[str, Any]:
        return {"job_id": job_id, "status": "completed", "output_url": "file://./output/local-out.mp4"}


def select_provider(config: Any) -> CapabilityProvider:
    """Choose a provider, preferring the real one.

    Mock providers are only ever returned when mock mode was switched on explicitly. The
    previous default was the opposite, which is how a fabricated film reached the CLI.
    """
    allow_mock = bool(getattr(config, "mock_mode", False))
    runtime_url = getattr(config, "runtime_url", "") or os.getenv("GENEI_RUNTIME_URL", "")

    if runtime_url:
        return LocalRuntimeProvider(
            base_url=runtime_url,
            token=os.getenv("GENEI_RUNTIME_TOKEN"),
            timeout_seconds=int(getattr(config, "timeout_seconds", 120)),
        )

    if allow_mock:
        policy = getattr(config, "policy", "prefer_local")
        return MockLocalRunner(allow_mock=True) if policy == "local_only" else MockCloudProvider(allow_mock=True)

    raise ProviderUnavailable(
        "No execution runtime is configured. Set GENEI_RUNTIME_URL to the Genei server's "
        "execution endpoint so generation runs on real hardware. Mock mode "
        "(GENEI_MOCK_MODE=true) exists only for tests and is off by default."
    )
