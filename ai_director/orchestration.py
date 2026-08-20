from .models import Project
from .config import Config
from .providers import MockCloudProvider, MockLocalRunner
from .director import AIDirector
from .voice import VoiceDirector
from .video import VideoOrchestrator
from .quality import EllipseScanQA
from .upscale import PostProduction

class PipelineOrchestrator:
    def __init__(self, config: Config):
        self.config = config
        self.provider = MockLocalRunner() if config.policy == "local_only" else MockCloudProvider()

    def run_project(self, project: Project) -> Project:
        director = AIDirector(project)
        voice_dir = VoiceDirector()
        video_orch = VideoOrchestrator(self.provider)
        qa = EllipseScanQA()
        post = PostProduction()

        # Step 1: Director script generation
        project = director.decompose_brief()

        # Step 2: Scene execution loop
        for scene in project.scenes:
            voice_dir.synthesize_scene_audio(scene)
            for shot in scene.shots:
                video_orch.generate_shot(shot)
                qa.verify_shot(shot)
            video_orch.stitch_scene(scene)
            post.upscale_scene(scene, project.resolution)

        project.status = "completed"
        return project
