from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import time

@dataclass
class Character:
    id: str
    name: str
    description: str
    reference_images: List[str] = field(default_factory=list)
    wardrobe: str = ""
    voice_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Shot:
    id: str
    scene_id: str
    sequence_index: int
    prompt: str
    duration_seconds: float = 4.0
    camera_motion: str = "static"
    dialogue: Optional[str] = None
    character_ids: List[str] = field(default_factory=list)
    status: str = "pending" # pending, generated, needs_review, approved, failed
    asset_url: Optional[str] = None
    route_used: Optional[str] = None
    qa_score: float = 1.0

@dataclass
class Scene:
    id: str
    scene_index: int
    title: str
    objective: str
    location: str
    time_of_day: str
    shots: List[Shot] = field(default_factory=list)
    status: str = "pending"
    audio_track_url: Optional[str] = None
    final_video_url: Optional[str] = None

@dataclass
class Project:
    id: str
    title: str
    brief: str
    aspect_ratio: str = "16:9"
    resolution: str = "1080p"
    fps: int = 24
    characters: List[Character] = field(default_factory=list)
    scenes: List[Scene] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    status: str = "draft"
