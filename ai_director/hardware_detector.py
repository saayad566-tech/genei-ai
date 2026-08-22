import platform
import shutil
import json
import sys

def detect_hardware():
    info = {
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python_version": sys.version,
        "disk_free_gb": round(shutil.disk_usage("/").free / (1024**3), 2),
        "has_cuda": False,
        "recommended_models": ["flux-schnell", "sdxl-base", "whisper-small", "gemma-2b"],
    }
    try:
        import torch
        info["has_cuda"] = torch.cuda.is_available()
        if info["has_cuda"]:
            info["cuda_device_name"] = torch.cuda.get_device_name(0)
            info["recommended_models"].append("flux-dev-fp16")
    except ImportError:
        pass

    return info

if __name__ == "__main__":
    print(json.dumps(detect_hardware(), indent=2))
