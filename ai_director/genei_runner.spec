# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

block_cipher = None
project_root = str(Path(SPEC).resolve().parent.parent)

analysis = Analysis(
    [str(Path(SPEC).resolve().parent / "runner_installer.py")],
    pathex=[project_root],
    binaries=[],
    datas=[],
    hiddenimports=[
        "requests",
        "urllib3",
        "charset_normalizer",
        "certifi",
        "idna",
        "ai_director.runner_client",
        "ai_director.runner_installer",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "numpy"],
    noarchive=False,
)

pyz = PYZ(analysis.pure, analysis.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.zipfiles,
    analysis.datas,
    [],
    name="GeneiRunner",
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
