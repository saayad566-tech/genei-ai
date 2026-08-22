import json

from ai_director.desktop_host import detect_hardware, main


def test_detect_hardware_returns_structured_capabilities():
    profile = detect_hardware()

    assert isinstance(profile["system"], str)
    assert isinstance(profile["machine"], str)
    assert isinstance(profile["cpu_count"], (int, type(None)))
    assert isinstance(profile["gpus"], list)
    assert isinstance(profile["accelerators"], list)
    assert isinstance(profile["runtimes"], dict)
    assert "ffmpeg" in profile["runtimes"]
    assert "recommended_models" in profile


def test_probe_mode_writes_machine_readable_json(capsys):
    assert main(["--probe"]) == 0
    output = capsys.readouterr().out.strip()
    profile = json.loads(output)

    assert profile["system"]
    assert "runtimes" in profile


def test_hardware_probe_does_not_require_torch_or_cuda():
    profile = detect_hardware()

    # A desktop without a vendor GPU is still a valid Genei machine. Local
    # accelerator availability is capability data, never an install blocker.
    assert profile["gpu_count"] == len(profile["gpus"])
    assert isinstance(profile["recommended_models"], list)
