import os
import sys
import subprocess
from pathlib import Path

print("[Genei Build] Building Genei BYOH Runner executable...")
root = Path(__file__).resolve().parent.parent
os.chdir(root)

# Create a robust executable wrapper
wrapper_code = '''
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
'''

Path("packaging/run_wrapper.py").write_text(wrapper_code, encoding="utf-8")
print("[Genei Build] PyInstaller spec wrapper written.")
