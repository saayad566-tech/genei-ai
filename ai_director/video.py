from __future__ import annotations

from typing import Any, Dict, Optional
import hashlib
import uuid

from .continuity import build_continuity_packet, condition_next_shot, plan_bridge
from .models import AssetLineage, ContinuityPacket, ProvenanceRecord, RepairAttempt, Scene, Shot
from .providers import CapabilityProvider


class VideoOrchestrator:
    def __init__(self, provider: CapabilityProvider):
        self.provider = provider

    def generate_shot(self, shot: Shot, *, scene: Optional[Scene] = None, continuity: Optional[ContinuityPacket] = None) -> Shot:
        if continuity:
            condition_next_shot(shot, continuity)
        shot.status = "generating"
        payload: Dict[str, Any] = {
            "prompt": shot.prompt,
            "duration": shot.duration_seconds,
            "camera_motion": shot.camera_motion,
            "character_ids": shot.character_ids,
            "reference_frame_url": continuity.reference_frame_url if continuity else None,
            "continuity_packet": continuity.__dict__ if continuity else None,
            "contract": shot.contract.__dict__,
        }
        res = self.provider.submit_job("video", payload)
        job_id = res.get("job_id", f"video-{uuid.uuid4().hex[:10]}")
        if res.get("status") not in {"completed", "processing", "pending"}:
            shot.status = "failed"
            return shot
        if res.get("status") != "completed":
            res = self.provider.poll_job(job_id)
        shot.asset_url = res.get("output_url")
        shot.final_frame_url = res.get("final_frame_url") or shot.asset_url
        shot.status = "generated" if shot.asset_url else "failed"
        shot.route_used = res.get("route") or self.provider.__class__.__name__
        prompt_hash = hashlib.sha256(shot.prompt.encode("utf-8")).hexdigest()
        shot.provenance = ProvenanceRecord(
            asset_id=shot.id,
            provider=shot.route_used,
            model=res.get("model"),
            route=shot.route_used,
            input_refs=[continuity.reference_frame_url] if continuity and continuity.reference_frame_url else [],
            prompt_hash=prompt_hash,
            parameters={"duration": shot.duration_seconds, "camera_motion": shot.camera_motion},
        )
        shot.lineage = AssetLineage(asset_id=shot.id, parent_asset_ids=[continuity.source_shot_id] if continuity and continuity.source_shot_id else [], provenance=shot.provenance)
        shot.end_continuity = build_continuity_packet(
            shot,
            scene,
            source_packet=continuity,
            reference_frame_url=shot.final_frame_url,
            extraction_status=res.get("extraction_status", "partial"),
        )
        return shot

    def extract_end_state(self, shot: Shot, scene: Optional[Scene] = None) -> ContinuityPacket:
        shot.end_continuity = build_continuity_packet(
            shot,
            scene,
            source_packet=shot.start_continuity,
            reference_frame_url=shot.final_frame_url or shot.asset_url,
            extraction_status="partial" if shot.asset_url else "not_available",
        )
        return shot.end_continuity

    def generate_bridge(self, previous: Shot, current: Shot, packet: ContinuityPacket) -> Dict[str, Any]:
        return plan_bridge(previous, current, packet)

    def validate_transition(self, previous: Shot, current: Shot) -> Dict[str, Any]:
        from .quality import EllipseScanQA
        return EllipseScanQA().verify_transition(previous, current)

    def repair_shot(self, shot: Shot, reason: str, *, scene: Optional[Scene] = None, continuity: Optional[ContinuityPacket] = None) -> Shot:
        repair = RepairAttempt(
            repair_id=f"repair_{uuid.uuid4().hex[:10]}",
            subject_id=shot.id,
            reason=reason,
            strategy="regenerate_smallest_failed_unit",
            status="running",
        )
        shot.repair_attempts.append(repair)
        repaired = self.generate_shot(shot, scene=scene, continuity=continuity)
        repair.status = "completed" if repaired.asset_url else "failed"
        repair.output_asset_id = repaired.id if repaired.asset_url else None
        return repaired

    def stitch_scene(self, scene: Scene) -> str:
        """Create a deterministic stitch manifest describing the approved shot order.

        A media worker can consume this manifest and render a real MP4 with overlap handles.
        The manifest URL is intentionally explicit so the UI does not mistake it for a video.
        """
        manifest_id = f"scene_{scene.id}_timeline_{uuid.uuid4().hex[:8]}"
        scene.final_video_url = f"manifest://{manifest_id}"
        scene.status = "stitched"
        scene.warnings = [
            "Final render is represented by a stitch manifest until a media worker with ffmpeg is paired.",
        ]
        return scene.final_video_url
