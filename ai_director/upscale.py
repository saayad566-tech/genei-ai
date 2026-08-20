from .models import Scene

class PostProduction:
    def upscale_scene(self, scene: Scene, target_resolution: str = "1080p") -> str:
        if scene.final_video_url:
            scene.final_video_url = scene.final_video_url.replace(".mp4", f"_{target_resolution}.mp4")
        return scene.final_video_url or ""
