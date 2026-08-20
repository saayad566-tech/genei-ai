from .models import Scene, Shot
from .providers import CapabilityProvider
from typing import List

class VideoOrchestrator:
    def __init__(self, provider: CapabilityProvider):
        self.provider = provider

    def generate_shot(self, shot: Shot) -> Shot:
        res = self.provider.submit_job("video", {"prompt": shot.prompt, "duration": shot.duration_seconds})
        shot.asset_url = res.get("output_url")
        shot.status = "generated"
        shot.route_used = "mock_provider"
        return shot

    def stitch_scene(self, scene: Scene) -> str:
        # Mock stitching routine returning final scene video URL
        final_url = f"file://./output/final_{scene.id}.mp4"
        scene.final_video_url = final_url
        scene.status = "stitched"
        return final_url
