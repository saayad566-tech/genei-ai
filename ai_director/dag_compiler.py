from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
import time
import uuid

from .brain import ProjectBrain, ProductionConstitution
from .models import Scene, Shot, ShotContract, SceneContract, DAGJob


@dataclass
class DAGNode:
    node_id: str
    kind: str  # scene, shot, asset, render
    subject_id: str
    dependencies: List[str] = field(default_factory=list)
    status: str = "queued"
    progress: float = 0.0
    retry_budget: int = 3
    attempt: int = 0
    route_preference: str = "auto"
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CompilationResult:
    project_id: str
    scenes: List[Scene] = field(default_factory=list)
    nodes: List[DAGNode] = field(default_factory=list)
    jobs: List[DAGJob] = field(default_factory=list)
    success: bool = True
    warnings: List[str] = field(default_factory=list)


def compile_production_dag(project_id: str, brain: ProjectBrain, constitution: ProductionConstitution) -> CompilationResult:
    scenes: List[Scene] = []
    nodes: List[DAGNode] = []
    jobs: List[DAGJob] = []
    warnings: List[str] = []

    # Compile a multi-scene structure from the brain events and entities
    num_scenes = max(1, len(brain.events))
    for idx, event in enumerate(brain.events or [None]):
        scene_index = idx + 1
        scene_id = f"scene_{scene_index}_{uuid.uuid4().hex[:8]}"
        scene_title = event.title if event else f"Scene {scene_index}"
        scene_obj = event.description if event else f"Execute narrative phase {scene_index}"

        shots: List[Shot] = []
        # Create 2 default shots per scene for robust continuity
        shot_types = [
            ("establishing", "Wide establishing shot with clear spatial geometry and cinematic framing"),
            ("action", "Close-up action or dialogue matching previous boundary continuation and character locks"),
        ]
        prev_shot_id: Optional[str] = None
        for s_idx, (s_kind, s_desc) in enumerate(shot_types):
            shot_seq = s_idx + 1
            shot_id = f"shot_{scene_index}_{shot_seq}_{uuid.uuid4().hex[:8]}"
            contract = ShotContract(
                required_inputs=[prev_shot_id] if prev_shot_id else [],
                acceptance_criteria=[
                    f"Maintain visual identity for participants",
                    f"Legible composition adhering to {constitution.visual_grammar.get('aspect_ratio', '16:9')}",
                ],
                continuity_constraints=[
                    "Preserve lighting, camera axis, and wardrobe",
                    "Condition start state on previous shot end state",
                ],
                dependency_ids=[prev_shot_id] if prev_shot_id else [],
            )
            shot = Shot(
                id=shot_id,
                scene_id=scene_id,
                sequence_index=shot_seq,
                prompt=f"{s_kind}: {s_desc}. Mood: {constitution.tone}.",
                duration_seconds=4.0,
                camera_motion="smooth_pan" if shot_seq == 1 else "static_portrait",
                status="pending",
                contract=contract,
            )
            shots.append(shot)
            nodes.append(DAGNode(
                node_id=f"node_{shot_id}",
                kind="shot",
                subject_id=shot_id,
                dependencies=[f"node_{prev_shot_id}"] if prev_shot_id else [],
                retry_budget=3,
            ))
            prev_shot_id = shot_id

        scene = Scene(
            id=scene_id,
            scene_index=scene_index,
            title=scene_title,
            objective=scene_obj,
            location="Cinematic Virtual Studio",
            time_of_day="Day",
            shots=shots,
            status="pending",
            contract=SceneContract(acceptance_criteria=["All shots passed QC", "Scene stitches cleanly"]),
        )
        scenes.append(scene)
        nodes.append(DAGNode(
            node_id=f"node_{scene_id}",
            kind="scene",
            subject_id=scene_id,
            dependencies=[f"node_{s.id}" for s in shots],
        ))
        jobs.append(DAGJob(
            id=f"job_{scene_id}_{uuid.uuid4().hex[:6]}",
            kind="scene_render",
            subject_id=scene_id,
            stage="compilation",
            status="queued",
            progress=0.0,
        ))

    return CompilationResult(
        project_id=project_id,
        scenes=scenes,
        nodes=nodes,
        jobs=jobs,
        success=True,
        warnings=warnings,
    )
