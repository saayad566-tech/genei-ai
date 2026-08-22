# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

project_root = str(Path(SPEC).resolve().parent.parent)

analysis = Analysis(
    [str(Path(SPEC).resolve().parent.parent / "ai_director" / "desktop_host.py")],
    pathex=[project_root],
    binaries=[],
    datas=[],
    hiddenimports=[
        "psutil",
        "ai_director.hardware_detector",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "numpy", "torch"],
    noarchive=False,
)

pyz = PYZ(analysis.pure, analysis.zipped_data, cipher=None)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.zipfiles,
    analysis.datas,
    [],
    name="GeneiAI-Director",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="x86_64",
    codesign_identity=None,
    entitlements_file=None,
)
