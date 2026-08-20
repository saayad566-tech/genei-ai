from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class CapabilityProvider(ABC):
    @abstractmethod
    def health(self) -> bool:
        pass

    @abstractmethod
    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def poll_job(self, job_id: str) -> Dict[str, Any]:
        pass

class MockCloudProvider(CapabilityProvider):
    def health(self) -> bool:
        return True

    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"job_id": f"cloud-{task_type}-123", "status": "completed", "output_url": f"https://storage.example.com/{task_type}-out.mp4"}

    def poll_job(self, job_id: str) -> Dict[str, Any]:
        return {"job_id": job_id, "status": "completed", "output_url": "https://storage.example.com/mock-out.mp4"}

class MockLocalRunner(CapabilityProvider):
    def health(self) -> bool:
        return True

    def submit_job(self, task_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {"job_id": f"local-{task_type}-456", "status": "completed", "output_url": f"file://./output/{task_type}-local.mp4"}

    def poll_job(self, job_id: str) -> Dict[str, Any]:
        return {"job_id": job_id, "status": "completed", "output_url": "file://./output/local-out.mp4"}
