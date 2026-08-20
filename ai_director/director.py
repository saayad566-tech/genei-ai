from __future__ import annotations

from .models import Character, Project, Scene, SceneContract, Shot, ShotContract


class AIDirector:
    def __init__(self, project: Project):
        self.project = project

    def decompose_brief(self) -> Project:
        brief = self.project.brief.strip()
        protagonist = Character(
            id="character-protagonist",
            name="Protagonist",
            description="Primary subject inferred from the project brief; identity remains reference-locked once supplied.",
            metadata={"source": "director_inference", "requires_reference": True},
            identity_lock_id="identity-lock-protagonist",
        )
        scene_1 = Scene(
            id="scene-1",
            scene_index=1,
            title="Introduction",
            objective=f"Establish setting and premise for: {brief}",
            location="Cinematic Studio",
            time_of_day="Day",
            contract=SceneContract(
                acceptance_criteria=["Setting is legible", "Narrative premise is established", "Character identity is stable"],
                boundary_constraints=["Preserve location, lighting, and camera axis into the next shot"],
            ),
        )
        shot_1 = Shot(
            id="shot-1-1",
            scene_id="scene-1",
            sequence_index=1,
            prompt=f"Cinematic wide establishing shot: {brief}; action: establishing movement",
            duration_seconds=4.0,
            camera_motion="pan right",
            dialogue="Welcome to the future of AI creation.",
            character_ids=[protagonist.id],
            contract=ShotContract(
                acceptance_criteria=["Wide establishing composition", "Readable movement direction", "No identity artifact"],
                continuity_constraints=["Create a stable end frame for the next shot"],
            ),
        )
        shot_2 = Shot(
            id="shot-1-2",
            scene_id="scene-1",
            sequence_index=2,
            prompt="Close-up character portrait with cinematic lighting and expressive emotion; action: continue movement from previous shot",
            duration_seconds=4.0,
            camera_motion="zoom in",
            dialogue="Every scene, voice, and edit orchestrated automatically.",
            character_ids=[protagonist.id],
            contract=ShotContract(
                required_inputs=["shot-1-1.end_continuity"],
                dependency_ids=["shot-1-1"],
                acceptance_criteria=["Match previous character identity", "Continue action phase", "Preserve camera axis and light"],
                continuity_constraints=["Previous shot end state is mandatory conditioning"],
            ),
        )
        scene_1.shots = [shot_1, shot_2]
        self.project.characters = [protagonist]
        self.project.production_constitution = {
            "identity_lock": True,
            "continuity_required": True,
            "regenerate_smallest_failed_unit": True,
            "realism_policy": "warn_on_artifacts; never claim indistinguishable realism",
            "fps": self.project.fps,
            "resolution": self.project.resolution,
        }
        self.project.scenes = [scene_1]
        self.project.status = "scripted"
        return self.project
