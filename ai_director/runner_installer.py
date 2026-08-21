"""BYOH runner auto-installer and updater for Genei AI.

Usage:
  python -m ai_director.runner_installer --server-url https://genieai-tc7qfq5i.manus.space --token genei_...
"""

from __future__ import annotations

import argparse
import os
import sys


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
