import os
from dataclasses import dataclass

@dataclass
class Config:
    policy: str = os.getenv("GENEI_POLICY", "prefer_local")
    output_dir: str = os.getenv("GENEI_OUTPUT_DIR", "./output")
    max_retries: int = int(os.getenv("GENEI_MAX_RETRIES", "3"))
    timeout_seconds: int = int(os.getenv("GENEI_TIMEOUT_SECONDS", "120"))
    mock_mode: bool = os.getenv("GENEI_MOCK_MODE", "true").lower() == "true"
