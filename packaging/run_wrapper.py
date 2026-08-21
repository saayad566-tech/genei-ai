
import sys
import os
from ai_director import runner_installer

if __name__ == "__main__":
    print("========================================")
    print("   Genei AI — BYOH Workstation Runner  ")
    print("========================================")
    if len(sys.argv) < 3:
        print("Usage: GeneiRunnerSetup.exe --server-url <url> --token <token>")
        server_url = input("Enter Genei Server URL (default https://genieai-tc7qfq5i.manus.space): ").strip() or "https://genieai-tc7qfq5i.manus.space"
        token = input("Enter Workstation Pairing Token: ").strip()
        sys.argv = [sys.argv[0], "--server-url", server_url, "--token", token]
    runner_installer.main()
