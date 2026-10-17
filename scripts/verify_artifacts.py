#!/usr/bin/env python3
"""Verify build artifacts are real before anyone trusts them (§4.2).

    python3 scripts/verify_artifacts.py --dir .
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

MAGIC = {".apk": b"PK\x03\x04", ".aab": b"PK\x03\x04",
         ".exe": b"MZ", ".zip": b"PK\x03\x04"}


def verify_dir(directory: str) -> dict:
    found, problems = [], []
    patterns = [os.path.join(directory, "**", e) for e in ("*.apk", "*.aab", "*.exe", "*.zip")]
    files = []
    for p in patterns:
        files.extend(glob.glob(p, recursive=True))
    for f in sorted(set(files)):
        size = os.path.getsize(f)
        if size == 0:
            problems.append(f"{f}: 0 bytes")
            continue
        ext = os.path.splitext(f)[1].lower()
        magic = MAGIC.get(ext)
        if magic and open(f, "rb").read(len(magic)) != magic:
            problems.append(f"{f}: wrong magic bytes for {ext}")
            continue
        found.append({"file": f, "bytes": size})
    if not found and not problems:
        problems.append("no artifacts found (*.apk/*.aab/*.exe/*.zip)")
    return {"ok": not problems, "artifacts": found, "problems": problems}


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", default=".")
    a = p.parse_args(argv)
    r = verify_dir(a.dir)
    print(json.dumps(r, indent=2))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
