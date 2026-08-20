from .models import Project, Scene, Shot, Character

class AIDirector:
    def __init__(self, project: Project):
        self.project = project

    def decompose_brief(self) -> Project:
        brief = self.project.brief
        # Default decomposition logic for scene-by-scene script generation
        scene_1 = Scene(
            id="scene-1",
            scene_index=1,
            title="Introduction",
            objective=f"Establish setting and premise for: {brief}",
            location="Cinematic Studio",
            time_of_day="Day"
        )
        shot_1 = Shot(
            id="shot-1-1",
            scene_id="scene-1",
            sequence_index=1,
            prompt=f"Cinematic wide establishing shot: {brief}",
            duration_seconds=4.0,
            camera_motion="pan right",
            dialogue="Welcome to the future of AI creation."
        )
        shot_2 = Shot(
            id="shot-1-2",
            scene_id="scene-1",
            sequence_index=2,
            prompt="Close-up character portrait with cinematic lighting and expressive emotion.",
            duration_seconds=4.0,
            camera_motion="zoom in",
            dialogue="Every scene, voice, and edit orchestrated automatically."
        )
        scene_1.shots = [shot_1, shot_2]
        self.project.scenes = [scene_1]
        self.project.status = "scripted"
        return self.project
