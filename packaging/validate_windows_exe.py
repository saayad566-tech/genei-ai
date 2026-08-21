from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


def inspect_pe(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 64 or data[:2] != b"MZ":
        raise ValueError("File is not a Windows PE executable: missing MZ header")

    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if pe_offset + 26 > len(data) or data[pe_offset : pe_offset + 4] != b"PE\\x00\\x00":
        raise ValueError("File is not a Windows PE executable: missing PE signature")

    machine = struct.unpack_from("<H", data, pe_offset + 4)[0]
    machine_names = {0x014C: "x86", 0x8664: "x64", 0xAA64: "arm64"}
    architecture = machine_names.get(machine, f"unknown-0x{machine:04x}")
    if architecture != "x64":
        raise ValueError(f"Expected win-x64 executable, found {architecture}")

    return {
        "path": str(path),
        "sizeBytes": len(data),
        "architecture": architecture,
        "format": "PE32+",
        "valid": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a Genei Windows PE executable")
    parser.add_argument("executable", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = inspect_pe(args.executable)
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"Valid Windows PE executable: {args.executable}")
        print(f"Architecture: {result['architecture']}; size: {result['sizeBytes']} bytes")


if __name__ == "__main__":
    main()
