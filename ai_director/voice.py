from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Protocol

from .models import Character, Scene


class SpeechAdapter(Protocol):
    """A real speech engine.

    ``is_available`` must reflect an actual health check, and ``synthesize`` must
    write a real audio file and return its path. An adapter that cannot do that must
    report itself unavailable rather than returning a plausible-looking path.
    """

    def is_available(self) -> bool: ...

    def synthesize(self, text: str, output_path: str) -> str: ...


@dataclass
class SpeechResult:
    status: str  # "completed" | "unsupported"
    audio_path: Optional[str] = None
    reason: Optional[str] = None


class VoiceDirector:
    """Turns a scene's dialogue into an audio track.

    There is deliberately no fallback synthesis. Previously this method returned a
    ``file://`` URL for a file it never created, which made a scene look like it had
    audio when it did not. If no speech engine is configured the honest result is
    ``unsupported`` and the scene is left without an audio track.
    """

    def __init__(self, adapter: Optional[SpeechAdapter] = None, output_dir: str = "output") -> None:
        self.adapter = adapter
        self.output_dir = output_dir

    def synthesize_scene_audio(self, scene: Scene, character: Optional[Character] = None) -> SpeechResult:
        dialogues = [shot.dialogue for shot in scene.shots if shot.dialogue]
        text = " ".join(dialogues) if dialogues else scene.objective
        if not text or not text.strip():
            return SpeechResult(status="unsupported", reason="This scene has no dialogue or objective to speak.")

        if self.adapter is None or not self.adapter.is_available():
            return SpeechResult(
                status="unsupported",
                reason=(
                    "No speech engine is installed, so no audio was produced. Install a speech "
                    "adapter (for example whisper.cpp for timing plus a text-to-speech engine) "
                    "to generate the track."
                ),
            )

        os.makedirs(self.output_dir, exist_ok=True)
        output_path = os.path.join(self.output_dir, f"audio_{scene.id}.wav")
        produced = self.adapter.synthesize(text, output_path)
        if not produced or not os.path.exists(produced):
            return SpeechResult(
                status="unsupported",
                reason=f"The speech engine reported success but no audio file exists at {produced or output_path}.",
            )

        scene.audio_track_url = produced
        return SpeechResult(status="completed", audio_path=produced)
