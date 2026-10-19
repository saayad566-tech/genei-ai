from __future__ import annotations

from .models import DAGJob, Project, RepairAttempt
from .config import Config
from .providers import select_provider
from .director import AIDirector
from .voice import VoiceDirector
from .video import VideoOrchestrator
from .quality import EllipseScanQA
from .upscale import PostProduction


class PipelineOrchestrator:
    def __init__(self, config: Config):
        self.config = config
        # select_provider prefers the real local runtime and raises rather than silently
        # substituting a mock. A run with no runtime must fail, not fabricate a film.
        self.provider = select_provider(config)
        #: True only when a real runtime is behind the provider.
        self.real_execution = bool(getattr(self.provider, "real", False))

    def _job(self, project: Project, kind: str, subject_id: str, stage: str) -> DAGJob:
        job = DAGJob(id=f"job_{kind}_{subject_id}", kind=kind, subject_id=subject_id, stage=stage, status="running")
        project.jobs.append(job)
        return job

    def run_project(self, project: Project) -> Project:
        director = AIDirector(project)
        voice_dir = VoiceDirector()
        video_orch = VideoOrchestrator(self.provider)
        qa = EllipseScanQA()
        post = PostProduction()

        project.status = "planning"
        project = director.decompose_brief()
        project.status = "generating"

        for scene in project.scenes:
            scene_job = self._job(project, "scene", scene.id, "scene_generation")
            speech_result = voice_dir.synthesize_scene_audio(scene)
            if speech_result.status != "completed":
                # No speech engine is installed, so the scene genuinely has no audio
                # track yet. It is left empty rather than given a placeholder URL.
                scene.audio_track_url = None
            previous_shot = None
            continuity = scene.start_continuity
            for shot in scene.shots:
                shot_job = self._job(project, "shot", shot.id, "shot_generation")
                shot_job.progress = 0.1
                video_orch.generate_shot(shot, scene=scene, continuity=continuity)
                shot_job.progress = 0.65
                report = qa.verify_shot(shot)
                if not report["passed"]:
                    shot.status = "failed"
                    video_orch.repair_shot(shot, "Initial shot QC did not pass", scene=scene, continuity=continuity)
                    report = qa.verify_shot(shot)
                if previous_shot:
                    transition_report = qa.verify_transition(previous_shot, shot)
                    if not transition_report["passed"]:
                        video_orch.repair_shot(shot, "Transition continuity QC failed", scene=scene, continuity=continuity)
                        qa.verify_shot(shot)
                shot_job.progress = 1.0 if shot.asset_url else 0.0
                shot_job.status = "completed" if shot.asset_url else "failed"
                previous_shot = shot
                continuity = shot.end_continuity
            scene.end_continuity = continuity
            scene.start_continuity = scene.start_continuity or (scene.shots[0].start_continuity if scene.shots else None)
            video_orch.stitch_scene(scene)
            upscale_result = post.upscale_scene(scene, project.resolution)
            if upscale_result.status != "completed":
                # Nothing was upscaled; final_video_url is left exactly as assembled.
                pass
            scene_job.progress = 1.0
            scene_job.status = "completed" if scene.final_video_url else "failed"

        failed_jobs = [job for job in project.jobs if job.status == "failed"]
        project.status = "completed" if not failed_jobs else "needs_review"

        # Record how this ran, so a caller can never mistake a mock run for a real one.
        project.execution_mode = "local-runtime" if self.real_execution else "mock"
        return project
