import argparse
import json
from .models import Project
from .config import Config
from .orchestration import PipelineOrchestrator

def main():
    parser = argparse.ArgumentParser(description="Genei AI Director CLI")
    parser.add_argument("--brief", type=str, default="A futuristic sci-fi city overview with flying vehicles.")
    parser.add_argument("--title", type=str, default="Sci-Fi Epics")
    parser.add_argument("--policy", type=str, default="prefer_local")
    args = parser.parse_args()

    project = Project(id="proj-001", title=args.title, brief=args.brief)
    config = Config(policy=args.policy)
    orch = PipelineOrchestrator(config)

    print(f"Starting Genei AI Director for project: {project.title}")
    result = orch.run_project(project)
    # Report how it actually ran. A mock run must never look like a real one.
    print(json.dumps({
        "status": result.status,
        "scenes": len(result.scenes),
        "execution_mode": result.execution_mode,
    }, indent=2))

if __name__ == "__main__":
    main()
