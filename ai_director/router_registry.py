from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class CapabilityRoute:
    capability: str  # text_generation, video_generation, image_analysis, audio_synthesis, rendering
    provider: str    # runway, pika, kling, heygen, local_ffmpeg, local_python
    model: str
    cost_per_unit: float = 0.0
    privacy_tier: str = "standard"  # standard, private, local_only
    supports_continuity: bool = True
    health_status: str = "healthy"


@dataclass
class ToolPluginManifest:
    plugin_id: str
    name: str
    version: str
    capabilities: List[str] = field(default_factory=list)
    required_hardware: Dict[str, Any] = field(default_factory=dict)
    installed: bool = False
    signature_verified: bool = True


class CapabilityRouter:
    def __init__(self) -> None:
        self.routes: List[CapabilityRoute] = [
            CapabilityRoute("video_generation", "runway", "gen-3-alpha", 0.05, "standard", True, "healthy"),
            CapabilityRoute("video_generation", "pika", "pika-2.0", 0.04, "standard", True, "healthy"),
            CapabilityRoute("video_generation", "kling", "kling-1.5", 0.04, "standard", True, "healthy"),
            CapabilityRoute("audio_synthesis", "heygen", "avatar-v2", 0.06, "standard", True, "healthy"),
            CapabilityRoute("rendering", "local_ffmpeg", "ffmpeg-7", 0.0, "local_only", True, "healthy"),
        ]

    def select_route(self, capability: str, privacy_tier: str = "standard", require_continuity: bool = True) -> Optional[CapabilityRoute]:
        candidates = [r for r in self.routes if r.capability == capability and r.health_status == "healthy"]
        if privacy_tier == "local_only":
            candidates = [c for c in candidates if c.privacy_tier == "local_only"]
        elif privacy_tier == "private":
            candidates = [c for c in candidates if c.privacy_tier in {"private", "local_only"}]
        if require_continuity:
            candidates = [c for c in candidates if c.supports_continuity]
        if not candidates:
            return self.routes[0] if self.routes else None
        # Return cheapest or first healthy candidate
        candidates.sort(key=lambda x: x.cost_per_unit)
        return candidates[0]
