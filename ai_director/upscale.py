from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Protocol

from .models import Scene


class UpscaleAdapter(Protocol):
    """A real upscaler (for example Video2X or Real-ESRGAN)."""

    def is_available(self) -> bool: ...

    def upscale(self, source_path: str, target_resolution: str) -> str: ...


@dataclass
class UpscaleResult:
    status: str  # "completed" | "unsupported"
    output_path: Optional[str] = None
    reason: Optional[str] = None


class PostProduction:
    """Finishing stage.

    Previously ``upscale_scene`` renamed the file extension in the URL string and
    reported success, which meant an upscale was recorded that never happened. Now a
    scene is only marked upscaled when an installed upscaler produced a file that
    actually exists on disk.
    """

    def __init__(self, adapter: Optional[UpscaleAdapter] = None) -> None:
        self.adapter = adapter

    def upscale_scene(self, scene: Scene, target_resolution: str = "1080p") -> UpscaleResult:
        if not scene.final_video_url:
            return UpscaleResult(status="unsupported", reason="This scene has no assembled video to upscale.")

        if self.adapter is None or not self.adapter.is_available():
            return UpscaleResult(
                status="unsupported",
                reason=(
                    "No upscaler is installed, so the scene was left at its current resolution. "
                    "Install an upscaler (for example Video2X or Real-ESRGAN) to finish at a higher resolution."
                ),
            )

        produced = self.adapter.upscale(scene.final_video_url, target_resolution)
        if not produced or not os.path.exists(produced):
            return UpscaleResult(
                status="unsupported",
                reason=f"The upscaler reported success but no output file exists at {produced or '(no path returned)'}.",
            )

        scene.final_video_url = produced
        return UpscaleResult(status="completed", output_path=produced)
