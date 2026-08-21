from __future__ import annotations

import json
import sys
import time
import uuid
from typing import Any

from .dag_compiler import compile_production_dag
from .brain import ProjectBrain, ProductionConstitution, StoryEvent


def build_brain(payload: dict[str, Any]) -> ProjectBrain:
    brief = str(payload.get("brief", "")).strip()
    parts = [part.strip() for part in brief.replace("!", ".").replace("?", ".").split(".") if part.strip()]
    if len(parts) < 2:
        seed = parts[0] if parts else brief or "The production begins"
        parts = [seed, f"The protagonist advances the objective established in {seed}", f"The story resolves the tension created by {seed}"]
    events = [
        StoryEvent(event_id=f"evt_{index + 1}", title=part[:120], description=part, sequence_order=index + 1, participants=["char_protagonist"])
        for index, part in enumerate(parts[:6])
    ]
    return ProjectBrain(
        brain_id=f"brain_{uuid.uuid4().hex[:12]}",
        project_id=str(payload.get("projectId", "project")),
        title=str(payload.get("title", "Genei AI Production")),
        events=events,
        source_fidelity_score=0.92,
        updated_at=time.time(),
    )


def main() -> None:
    payload = json.load(sys.stdin)
    aspect_ratio = str(payload.get("aspectRatio", "16:9"))
    fps = int(payload.get("fps", 24))
    constitution = ProductionConstitution(
        constitution_id=f"constitution_{uuid.uuid4().hex[:12]}",
        visual_grammar={"aspect_ratio": aspect_ratio, "fps": fps, "color_grade": "teal_and_orange"},
    )
    result = compile_production_dag(str(payload.get("projectId", "project")), build_brain(payload), constitution)
    print(json.dumps({"compiler": "python-ai-director", "result": result.__dict__}, default=lambda value: value.__dict__))


if __name__ == "__main__":
    main()
