from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING,  Any, Dict, List, Optional
import time

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .take_selection import Take


@dataclass
class EvidenceValue:
    value: Any = None
    source: str = "unknown"  # observed, inferred, requested, unknown
    confidence: float = 0.0
    evidence_ref: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class Character:
    id: str
    name: str
    description: str
    reference_images: List[str] = field(default_factory=list)
    wardrobe: str = ""
    voice_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    identity_lock_id: Optional[str] = None
    dna: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CameraState:
    shot_size: str = "medium"
    lens: str = "natural"
    position: Dict[str, float] = field(default_factory=dict)
    orientation: Dict[str, float] = field(default_factory=dict)
    motion_vector: Dict[str, float] = field(default_factory=dict)
    axis: str = ""
    depth_of_field: str = ""


@dataclass
class CharacterState:
    character_id: str
    screen_position: Dict[str, float] = field(default_factory=dict)
    facing_direction: str = "unknown"
    pose: str = "unknown"
    action_phase: str = "unknown"
    gaze: str = "unknown"
    expression: str = "unknown"
    wardrobe: str = ""
    physical_condition: str = ""
    confidence: float = 0.0
    reference_frame: Optional[str] = None


@dataclass
class WorldState:
    location_id: str = ""
    location_description: str = ""
    geography: Dict[str, Any] = field(default_factory=dict)
    time_of_day: str = ""
    weather: str = ""
    lighting: Dict[str, Any] = field(default_factory=dict)
    props: Dict[str, Any] = field(default_factory=dict)
    vehicles: Dict[str, Any] = field(default_factory=dict)
    environmental_motion: str = ""


@dataclass
class AudioState:
    dialogue_cursor_ms: int = 0
    voice_id: str = ""
    ambience: str = ""
    music_beat: Optional[float] = None
    timecode_ms: int = 0
    lip_sync_cursor_ms: int = 0


@dataclass
class ContinuityPacket:
    packet_id: str
    source_shot_id: Optional[str] = None
    source_scene_id: Optional[str] = None
    narrative_handoff: Dict[str, Any] = field(default_factory=dict)
    characters: List[CharacterState] = field(default_factory=list)
    world: WorldState = field(default_factory=WorldState)
    camera: CameraState = field(default_factory=CameraState)
    audio: AudioState = field(default_factory=AudioState)
    technical: Dict[str, Any] = field(default_factory=dict)
    reference_frame_url: Optional[str] = None
    extraction_status: str = "not_available"  # observed, partial, not_available, failed
    warnings: List[str] = field(default_factory=list)
    confidence: Dict[str, float] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class ProvenanceRecord:
    asset_id: str
    provider: str
    model: Optional[str] = None
    route: str = ""
    input_refs: List[str] = field(default_factory=list)
    prompt_hash: Optional[str] = None
    seed: Optional[int] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class QCFinding:
    category: str
    severity: str  # info, warning, error, blocker
    message: str
    evidence_ref: Optional[str] = None
    confidence: float = 0.0
    repair_action: Optional[str] = None


@dataclass
class QCReport:
    report_id: str
    subject_id: str
    passed: bool
    score: float
    findings: List[QCFinding] = field(default_factory=list)
    transition: bool = False
    created_at: float = field(default_factory=time.time)


@dataclass
class RepairAttempt:
    repair_id: str
    subject_id: str
    reason: str
    strategy: str
    status: str = "pending"  # pending, running, completed, failed, accepted_with_warning
    output_asset_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)


@dataclass
class AssetLineage:
    asset_id: str
    parent_asset_ids: List[str] = field(default_factory=list)
    version: int = 1
    status: str = "draft"  # draft, approved, superseded, rejected
    provenance: Optional[ProvenanceRecord] = None
    qc_report_ids: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


@dataclass
class ShotContract:
    required_inputs: List[str] = field(default_factory=list)
    acceptance_criteria: List[str] = field(default_factory=list)
    continuity_constraints: List[str] = field(default_factory=list)
    dependency_ids: List[str] = field(default_factory=list)


@dataclass
class SceneContract:
    required_inputs: List[str] = field(default_factory=list)
    acceptance_criteria: List[str] = field(default_factory=list)
    dependency_ids: List[str] = field(default_factory=list)
    boundary_constraints: List[str] = field(default_factory=list)


@dataclass
class DAGJob:
    id: str
    kind: str
    subject_id: str
    dependency_ids: List[str] = field(default_factory=list)
    status: str = "queued"  # queued, running, paused, completed, failed, blocked, cancelled
    progress: float = 0.0
    stage: str = "queued"
    error: Optional[str] = None
    attempt: int = 0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


@dataclass
class Shot:
    id: str
    scene_id: str
    sequence_index: int
    prompt: str
    duration_seconds: float = 4.0
    # Motion is deliberately kept as five separate instructions rather than one blob,
    # so a generator can be told exactly which part of the shot moves and how.
    visual_prompt: str = ""
    camera_motion: str = "static"
    subject_motion: str = ""
    environment_motion: str = ""
    transition_style: str = ""
    dialogue: Optional[str] = None
    character_ids: List[str] = field(default_factory=list)
    status: str = "pending"  # pending, generating, generated, needs_review, approved, failed
    asset_url: Optional[str] = None
    route_used: Optional[str] = None
    qa_score: float = 1.0
    contract: ShotContract = field(default_factory=ShotContract)
    start_continuity: Optional[ContinuityPacket] = None
    end_continuity: Optional[ContinuityPacket] = None
    provenance: Optional[ProvenanceRecord] = None
    lineage: Optional[AssetLineage] = None
    qc_reports: List[QCReport] = field(default_factory=list)
    repair_attempts: List[RepairAttempt] = field(default_factory=list)
    final_frame_url: Optional[str] = None
    # Every attempt is kept, including the ones that failed. Append-only.
    takes: List["Take"] = field(default_factory=list)
    selected_take_id: Optional[str] = None


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
    contract: SceneContract = field(default_factory=SceneContract)
    start_continuity: Optional[ContinuityPacket] = None
    end_continuity: Optional[ContinuityPacket] = None
    job: Optional[DAGJob] = None
    warnings: List[str] = field(default_factory=list)


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
    production_constitution: Dict[str, Any] = field(default_factory=dict)
    asset_lineage: List[AssetLineage] = field(default_factory=list)
    jobs: List[DAGJob] = field(default_factory=list)
    qc_reports: List[QCReport] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
