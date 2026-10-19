import os
from dataclasses import dataclass


@dataclass
class Config:
    policy: str = os.getenv("GENEI_POLICY", "prefer_local")

    #: The Genei server's execution endpoint. Required for a real run.
    runtime_url: str = os.getenv("GENEI_RUNTIME_URL", "")

    output_dir: str = os.getenv("GENEI_OUTPUT_DIR", "./output")
    max_retries: int = int(os.getenv("GENEI_MAX_RETRIES", "3"))
    timeout_seconds: int = int(os.getenv("GENEI_TIMEOUT_SECONDS", "120"))

    #: Mock mode fabricates results, so it is OFF unless explicitly switched on.
    #: It previously defaulted to "true", which meant the CLI reported a completed film
    #: whose asset URLs pointed at storage.example.com. A default that fakes is worse
    #: than no default at all.
    mock_mode: bool = os.getenv("GENEI_MOCK_MODE", "false").lower() == "true"
