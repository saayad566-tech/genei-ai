"""BYOH runner heartbeat client for Genei AI.

Run this on a paired workstation, not inside the Genei web server:

  GENEI_SERVER_URL=https://your-genei-origin.example \
  GENEI_RUNNER_TOKEN=genei_... \
  python -m ai_director.runner_client

The runner reports hardware and tool metadata through an outbound heartbeat. It
never receives provider keys and it does not execute arbitrary shell commands.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Dict, List

import requests


@dataclass
class RunnerConfig:
    server_url: str
    token: str
    interval_seconds: int = 30


def _run_probe(args: List[str], timeout: int = 8) -> str:
    try:
        result = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _parse_mb(value: Any) -> str:
    if value is None:
        return "unknown"
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)", str(value).replace(",", ""))
    if not match:
        return "unknown"
    number = float(match.group(1))
    text = str(value).lower()
    if "gb" in text or "gib" in text:
        number *= 1024
    elif "byte" in text:
        number /= 1024 * 1024
    return str(int(number))


def _nvidia_gpus() -> List[Dict[str, str]]:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return []
    output = _run_probe([executable, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], timeout=5)
    gpus: List[Dict[str, str]] = []
    for line in output.splitlines():
        if "," in line:
            name, memory = [part.strip() for part in line.split(",", 1)]
            gpus.append({"name": name, "vram_mb": _parse_mb(memory)})
    return gpus


def _mac_gpus() -> List[Dict[str, str]]:
    if platform.system() != "Darwin":
        return []
    output = _run_probe(["system_profiler", "SPDisplaysDataType", "-json"])
    if not output:
        return []
    try:
        entries = json.loads(output).get("SPDisplaysDataType", [])
    except json.JSONDecodeError:
        return []
    return [{"name": item.get("sppci_model", "Apple GPU"), "vram_mb": _parse_mb(item.get("spdisplays_vram"))} for item in entries]


def _windows_gpus() -> List[Dict[str, str]]:
    if platform.system() != "Windows":
        return []
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    if not powershell:
        return []
    output = _run_probe([powershell, "-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"])
    if not output:
        return []
    try:
        entries = json.loads(output)
        if isinstance(entries, dict):
            entries = [entries]
    except json.JSONDecodeError:
        return []
    return [{"name": item.get("Name", "Windows GPU"), "vram_mb": _parse_mb(f'{item.get("AdapterRAM")} bytes')} for item in entries]


def _memory_mb() -> int | None:
    system = platform.system()
    if system == "Linux":
        try:
            with open("/proc/meminfo", "r", encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith("MemTotal:"):
                        return int(line.split()[1]) // 1024
        except (OSError, ValueError, IndexError):
            return None
    if system == "Darwin":
        value = _run_probe(["sysctl", "-n", "hw.memsize"])
        try:
            return int(value) // (1024 * 1024)
        except ValueError:
            return None
    if system == "Windows":
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if powershell:
            value = _run_probe([powershell, "-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"])
            try:
                return int(value) // (1024 * 1024)
            except ValueError:
                return None
    return None


def discover_hardware() -> Dict[str, Any]:
    tool_names = ("ffmpeg", "git", "docker", "python3", "python")
    tools = {tool: bool(shutil.which(tool) or os.environ.get(f"GENEI_{tool.upper()}")) for tool in tool_names}
    gpus = _nvidia_gpus() or _windows_gpus() or _mac_gpus()
    return {
        "cpu_count": os.cpu_count(),
        "ram_mb": _memory_mb(),
        "gpus": gpus,
        "gpu_count": len(gpus),
        "platform": platform.platform(),
        "tools": tools,
    }


def discover_capabilities() -> List[str]:
    hardware = discover_hardware()
    capabilities = ["local-python", "local-media-pipeline"]
    if hardware["gpu_count"]:
        capabilities.append("gpu")
    if platform.system() == "Darwin":
        capabilities.append("gpu-metal-compatible")
    for tool, installed in hardware["tools"].items():
        if installed:
            capabilities.append(tool)
    configured_tool = os.environ.get("GENEI_VIDEO_TOOL")
    if configured_tool:
        capabilities.append(configured_tool)
    return capabilities


def send_heartbeat(config: RunnerConfig) -> dict:
    url = config.server_url.rstrip("/") + "/api/trpc/runners.heartbeat"
    payload = {
        "json": {
            "token": config.token,
            "platform": f"{platform.system()} {platform.release()}",
            "capabilities": discover_capabilities(),
            "hardware": discover_hardware(),
        }
    }
    response = requests.post(url, json=payload, timeout=15)
    response.raise_for_status()
    return response.json()


def main() -> None:
    server_url = os.environ.get("GENEI_SERVER_URL")
    token = os.environ.get("GENEI_RUNNER_TOKEN")
    if not server_url or not token:
        raise SystemExit("Set GENEI_SERVER_URL and GENEI_RUNNER_TOKEN before starting the runner")
    config = RunnerConfig(
        server_url=server_url,
        token=token,
        interval_seconds=int(os.environ.get("GENEI_HEARTBEAT_SECONDS", "30")),
    )
    print(json.dumps({"event": "runner_started", "hardware": discover_hardware(), "capabilities": discover_capabilities()}))
    while True:
        try:
            result = send_heartbeat(config)
            print(json.dumps({"event": "heartbeat_ok", "result": result}), flush=True)
        except requests.RequestException as error:
            print(json.dumps({"event": "heartbeat_failed", "error": str(error)}), flush=True)
        time.sleep(config.interval_seconds)


if __name__ == "__main__":
    main()
