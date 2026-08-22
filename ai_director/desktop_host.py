"""Internal Genei AI Desktop host and capability probe.

The Windows package launches this module as an embedded sidecar. It does not
require users to install Python, a runner, or a third-party hardware detector.
The probe intentionally uses optional best-effort checks and never blocks the
application when an accelerator or local runtime is absent.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def _command_output(command: list[str], timeout: float = 2.5) -> str:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _memory_profile() -> tuple[float | None, float | None, int | None]:
    try:
        import psutil  # type: ignore

        memory = psutil.virtual_memory()
        return (
            round(memory.total / (1024**3), 2),
            round(memory.available / (1024**3), 2),
            psutil.cpu_count(logical=True),
        )
    except ImportError:
        cpu_count = os.cpu_count()
        if platform.system() == "Windows":
            output = _command_output(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
                ]
            )
            try:
                total_gb = round(int(output) / (1024**3), 2)
            except (TypeError, ValueError):
                total_gb = None
            return total_gb, None, cpu_count
        return None, None, cpu_count


def _gpu_profile() -> list[dict[str, Any]]:
    system = platform.system()
    gpus: list[dict[str, Any]] = []

    nvidia = _command_output(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ]
    )
    for row in nvidia.splitlines():
        fields = [field.strip() for field in row.split(",")]
        if not fields or not fields[0]:
            continue
        vram: int | None
        try:
            vram = int(float(fields[1])) if len(fields) > 1 else None
        except ValueError:
            vram = None
        gpus.append({"name": fields[0], "vram_mb": vram, "backend": "cuda"})

    if not gpus and system == "Windows":
        output = _command_output(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
            ]
        )
        try:
            payload = json.loads(output) if output else []
            if isinstance(payload, dict):
                payload = [payload]
            for item in payload:
                name = str(item.get("Name", "")).strip()
                if not name:
                    continue
                raw_vram = item.get("AdapterRAM")
                vram = round(int(raw_vram) / (1024**2)) if raw_vram else None
                backend = "directml" if "microsoft" not in name.lower() else "directml"
                gpus.append({"name": name, "vram_mb": vram, "backend": backend})
        except (TypeError, ValueError, json.JSONDecodeError):
            pass

    return gpus


def _runtime_profile() -> dict[str, bool]:
    return {
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "git": shutil.which("git") is not None,
        "ollama": shutil.which("ollama") is not None,
        "comfyui": bool(os.environ.get("GENEI_COMFYUI_URL")),
        "python": True,
        "node": shutil.which("node") is not None,
    }


def detect_hardware() -> dict[str, Any]:
    total_memory, available_memory, cpu_count = _memory_profile()
    gpus = _gpu_profile()
    disk_root = Path.home().anchor or os.path.abspath(os.sep)
    try:
        disk_free_gb = round(shutil.disk_usage(disk_root).free / (1024**3), 2)
    except OSError:
        disk_free_gb = None

    accelerators = sorted({str(gpu["backend"]) for gpu in gpus})
    if platform.system() == "Windows" and not accelerators:
        accelerators.append("cpu")

    return {
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor() or "Unknown CPU",
        "python_version": platform.python_version(),
        "disk_free_gb": disk_free_gb,
        "memory_total_gb": total_memory,
        "memory_available_gb": available_memory,
        "cpu_count": cpu_count,
        "gpu_count": len(gpus),
        "gpus": gpus,
        "accelerators": accelerators,
        "runtimes": _runtime_profile(),
        "recommended_models": ["gemma-2b", "whisper-small", "sdxl-base", "flux-schnell"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genei AI Desktop internal capability probe")
    parser.add_argument("--probe", action="store_true", help="print a machine-readable hardware profile")
    args = parser.parse_args(argv)
    profile = detect_hardware()
    if args.probe:
        print(json.dumps(profile, separators=(",", ":")))
    else:
        print("Genei AI Desktop internal capability probe")
        print(json.dumps(profile, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
