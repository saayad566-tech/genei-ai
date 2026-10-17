from __future__ import annotations

from .models import DAGJob, Project, RepairAttempt
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
        return project
