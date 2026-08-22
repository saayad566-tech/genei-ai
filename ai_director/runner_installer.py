"""BYOH runner auto-installer and updater for Genei AI.

Usage:
  python -m ai_director.runner_installer --server-url https://genieai-tc7qfq5i.manus.space --token genei_...
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from pathlib import Path


def install_dependencies(requirements_file: str | None = None) -> list[str]:
    """Return required packages that are unavailable without mutating the host.

    Installation is intentionally delegated to the desktop packaging/bootstrap
    layer. Importing this module must remain safe on a fresh machine, and the
    returned list gives that layer actionable recovery information.
    """
    requirements_path = Path(requirements_file) if requirements_file else Path(__file__).with_name("requirements.txt")
    if not requirements_path.exists():
        return []

    missing: list[str] = []
    for line in requirements_path.read_text(encoding="utf-8").splitlines():
        requirement = line.strip()
        if not requirement or requirement.startswith("#"):
            continue
        package_name = requirement.split("==", 1)[0].split(">=", 1)[0].split("[", 1)[0].strip()
        import_name = package_name.replace("-", "_")
        if importlib.util.find_spec(import_name) is None:
            missing.append(package_name)
    return missing


def main() -> None:
    parser = argparse.ArgumentParser(description="Install and run Genei BYOH workstation runner")
    parser.add_argument("--server-url", required=True, help="Genei server URL")
    parser.add_argument("--token", required=True, help="Workstation pairing token")
    args = parser.parse_args()

    os.environ["GENEI_SERVER_URL"] = args.server_url
    os.environ["GENEI_RUNNER_TOKEN"] = args.token

    print("[Genei BYOH] Starting secure runner client...")
    from ai_director import runner_client
    runner_client.main()


if __name__ == "__main__":
    main()
