from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
import hashlib
import time
import uuid


@dataclass
class SourceAsset:
    asset_id: str
    filename: str
    mime_type: str
    checksum: str
    size_bytes: int
    storage_url: str
    provenance: Dict[str, Any] = field(default_factory=dict)
    extraction_status: str = "pending"  # pending, analyzed, failed
    rights: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class EvidenceSpan:
    span_id: str
    source_asset_id: str
    locator: str  # page, timestamp, or line range
    verbatim_text: str
    confidence: float = 1.0
    tags: List[str] = field(default_factory=list)


@dataclass
class StoryEntity:
    entity_id: str
    name: str
    category: str  # character, location, prop, vehicle
    description: str
    evidence_refs: List[str] = field(default_factory=list)
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StoryEvent:
    event_id: str
    title: str
    description: str
    sequence_order: int
    participants: List[str] = field(default_factory=list)
    location_id: Optional[str] = None
    evidence_refs: List[str] = field(default_factory=list)


@dataclass
class ProjectBrain:
    brain_id: str
    project_id: str
    title: str
    sources: List[SourceAsset] = field(default_factory=list)
    entities: List[StoryEntity] = field(default_factory=list)
    events: List[StoryEvent] = field(default_factory=list)
    evidence_spans: List[EvidenceSpan] = field(default_factory=list)
    source_fidelity_score: float = 0.95
    hallucination_warnings: List[str] = field(default_factory=list)
    unresolved_questions: List[str] = field(default_factory=list)
    version: int = 1
    updated_at: float = field(default_factory=time.time)


@dataclass
class ProductionConstitution:
    constitution_id: str
    tone: str = "Cinematic & Immersive"
    genre: str = "Sci-Fi / Drama"
    target_audience: str = "General Audiences"
    adaptation_mode: str = "faithful"  # faithful, creative_adaptation, satirical, minimalist
    spoiler_policy: str = "strict_fidelity"
    visual_grammar: Dict[str, Any] = field(default_factory=lambda: {"aspect_ratio": "16:9", "fps": 24, "color_grade": "teal_and_orange"})
    safety_rules: List[str] = field(default_factory=lambda: ["No unconsented likenesses", "No harmful content"])
    privacy_policy: str = "standard"  # standard, privacy_first, local_only
    autonomy_level: str = "supervised"  # manual, supervised, autonomous
    version: int = 1


def create_project_brain(project_id: str, title: str, brief: str, sources: Optional[List[SourceAsset]] = None) -> ProjectBrain:
    asset_list = sources or []
    brain = ProjectBrain(
        brain_id=f"brain_{uuid.uuid4().hex[:12]}",
        project_id=project_id,
        title=title,
        sources=asset_list,
        entities=[
            StoryEntity(
                entity_id="char_protagonist",
                name="Protagonist",
                category="character",
                description=f"Primary subject derived from brief: {brief}",
                attributes={"role": "lead", "wardrobe": "futuristic utilitarian"},
            )
        ],
        events=[
            StoryEvent(
                event_id="evt_1",
                title="Inciting Incident",
                description=f"Initial narrative event establishing: {brief}",
                sequence_order=1,
                participants=["char_protagonist"],
            )
        ],
        source_fidelity_score=0.92,
    )
    return brain


def validate_constitution(constitution: ProductionConstitution) -> List[str]:
    warnings: List[str] = []
    if not constitution.tone:
        warnings.append("Production Constitution is missing tone specification.")
    if constitution.adaptation_mode not in {"faithful", "creative_adaptation", "satirical", "minimalist"}:
        warnings.append(f"Unknown adaptation mode: {constitution.adaptation_mode}")
    return warnings
