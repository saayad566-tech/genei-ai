from __future__ import annotations

from dataclasses import replace
from typing import Any, Dict, List, Optional
import hashlib
import re
import uuid

from .models import (
    AudioState,
    CameraState,
    CharacterState,
    ContinuityPacket,
    QCFinding,
    Scene,
    Shot,
    WorldState,
)


def _packet_id() -> str:
    return f"continuity_{uuid.uuid4().hex[:12]}"


def _prompt_value(prompt: str, labels: List[str], default: str = "unknown") -> str:
    lower = prompt.lower()
    for label in labels:
        match = re.search(rf"{re.escape(label)}\s*[:=]\s*([^,.;]+)", lower)
        if match:
            return match.group(1).strip()
    return default


def build_continuity_packet(
    shot: Shot,
    scene: Optional[Scene] = None,
    *,
    source_packet: Optional[ContinuityPacket] = None,
    reference_frame_url: Optional[str] = None,
    extraction_status: str = "partial",
) -> ContinuityPacket:
    """Create a normalized boundary packet without inventing unavailable observations.

    Provider vision outputs can be merged later by replacing fields with source='observed'.
    The deterministic fallback only carries explicit shot/scene metadata and marks the rest
    as unknown, which prevents false confidence in continuity decisions.
    """
    packet = ContinuityPacket(
        packet_id=_packet_id(),
        source_shot_id=shot.id,
        source_scene_id=scene.id if scene else shot.scene_id,
        reference_frame_url=reference_frame_url or shot.final_frame_url or shot.asset_url,
        extraction_status=extraction_status,
        technical={
            "fps": scene.metadata.get("fps") if scene and hasattr(scene, "metadata") else None,
            "sequence_index": shot.sequence_index,
            "shot_id": shot.id,
        },
    )
    if source_packet:
        packet.narrative_handoff = dict(source_packet.narrative_handoff)
        packet.narrative_handoff["previous_shot_id"] = source_packet.source_shot_id
        packet.world = replace(source_packet.world)
        packet.camera = replace(source_packet.camera)
        packet.audio = replace(source_packet.audio)
        packet.characters = [replace(c) for c in source_packet.characters]
        packet.confidence = dict(source_packet.confidence)
        packet.warnings = list(source_packet.warnings)

    direction = _prompt_value(shot.prompt, ["direction", "facing", "moving"], "unknown")
    action = _prompt_value(shot.prompt, ["action", "motion", "movement"], "unknown")
    if shot.character_ids:
        existing = {c.character_id: c for c in packet.characters}
        for character_id in shot.character_ids:
            character = existing.get(character_id, CharacterState(character_id=character_id))
            if direction != "unknown":
                character.facing_direction = direction
            if action != "unknown":
                character.action_phase = action
            character.confidence = max(character.confidence, 0.45 if extraction_status == "partial" else 0.2)
            packet.characters = [c for c in packet.characters if c.character_id != character_id] + [character]

    packet.camera = replace(packet.camera, motion_vector={"intent": shot.camera_motion})
    if scene:
        packet.world.location_id = scene.location
        packet.world.time_of_day = scene.time_of_day
        packet.narrative_handoff.update({
            "scene_objective": scene.objective,
            "scene_title": scene.title,
            "next_action": shot.prompt,
        })
    packet.warnings.append("Boundary extraction is partial; provider vision or a BYOH analyzer should confirm pose, geometry, and motion.")
    return packet


def condition_next_shot(shot: Shot, packet: ContinuityPacket) -> Shot:
    """Attach the upstream packet as explicit, non-optional generation context."""
    shot.start_continuity = packet
    constraints = [
        f"Continue from boundary packet {packet.packet_id}.",
        "Do not reset the character, camera axis, lighting, wardrobe, props, or motion direction.",
    ]
    constraints.extend(packet.warnings)
    shot.contract.continuity_constraints = list(dict.fromkeys(shot.contract.continuity_constraints + constraints))
    state_summary = {
        "characters": [c.__dict__ for c in packet.characters],
        "world": packet.world.__dict__,
        "camera": packet.camera.__dict__,
        "audio": packet.audio.__dict__,
        "reference_frame_url": packet.reference_frame_url,
    }
    shot.prompt = f"{shot.prompt}\nCONTINUITY_CONTEXT={state_summary}"
    return shot


def plan_bridge(previous: Shot, next_shot: Shot, packet: ContinuityPacket) -> Dict[str, Any]:
    """Return a bridge plan for providers without native continuation support."""
    return {
        "bridge_id": f"bridge_{previous.id}_{next_shot.id}",
        "source_shot_id": previous.id,
        "target_shot_id": next_shot.id,
        "duration_seconds": min(1.5, max(0.5, previous.duration_seconds * 0.25)),
        "reference_frame_url": packet.reference_frame_url,
        "requires_overlap": True,
        "reason": "Provider does not advertise native continuation or first-frame conditioning.",
    }


def compare_transition(previous: ContinuityPacket, current: ContinuityPacket) -> List[QCFinding]:
    findings: List[QCFinding] = []
    previous_chars = {c.character_id: c for c in previous.characters}
    current_chars = {c.character_id: c for c in current.characters}
    for character_id, before in previous_chars.items():
        after = current_chars.get(character_id)
        if not after:
            findings.append(QCFinding("identity", "blocker", f"Character {character_id} disappeared at the boundary.", repair_action="regenerate_boundary"))
            continue
        if before.facing_direction != "unknown" and after.facing_direction != "unknown" and before.facing_direction != after.facing_direction:
            findings.append(QCFinding("temporal", "warning", f"Character {character_id} changed facing direction across the boundary.", repair_action="regenerate_boundary"))
        if before.wardrobe and after.wardrobe and before.wardrobe != after.wardrobe:
            findings.append(QCFinding("identity", "blocker", f"Character {character_id} wardrobe changed across the boundary.", repair_action="regenerate_shot"))
        if before.action_phase != "unknown" and after.action_phase == "unknown":
            findings.append(QCFinding("temporal", "warning", f"Character {character_id} action phase was not observed in the next clip.", repair_action="run_boh_analyzer"))
    if previous.world.location_id and current.world.location_id and previous.world.location_id != current.world.location_id:
        findings.append(QCFinding("world", "blocker", "Location changed without a narrative transition.", repair_action="regenerate_boundary"))
    if previous.camera.axis and current.camera.axis and previous.camera.axis != current.camera.axis:
        findings.append(QCFinding("camera", "warning", "Camera axis changed across the boundary.", repair_action="regenerate_shot"))
    if previous.reference_frame_url is None:
        findings.append(QCFinding("technical", "warning", "Previous clip has no final-frame reference for conditioning.", repair_action="run_frame_extractor"))
    if previous.audio.timecode_ms and current.audio.timecode_ms < previous.audio.timecode_ms:
        findings.append(QCFinding("audio", "warning", "Audio timecode moved backwards across the boundary.", repair_action="align_audio"))
    return findings


def transition_fingerprint(packet: ContinuityPacket) -> str:
    value = repr({
        "characters": [c.__dict__ for c in packet.characters],
        "world": packet.world.__dict__,
        "camera": packet.camera.__dict__,
        "audio": packet.audio.__dict__,
    })
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
