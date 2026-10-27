#!/usr/bin/env python3
"""Pre-packaging validator for self-contained web/app projects.

Checks a project directory against the rules that decide whether a zip will
convert cleanly into an APK (browser-based packagers, Capacitor/Cordova cloud
builds, GitHub Actions) or wrap into an EXE (Electron / PyInstaller).

Usage:
    python validate_project.py <project-dir> [--entry index.html] [--json]

Exit codes: 0 = clean or warnings only, 1 = at least one error.
"""

import argparse
import json
import os
import re
import struct
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".idea", ".vscode", ".pytest_cache", ".next", "coverage", "android",
}

TEXT_EXT = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".json", ".xml", ".svg", ".txt", ".md", ".py", ".yml", ".yaml",
    ".gradle", ".java", ".kt", ".cs", ".csproj", ".toml", ".cfg", ".ini",
    ".webmanifest", ".sh", ".bat", ".ps1",
}

BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2",
    ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".wav", ".zip", ".jar", ".so",
    ".dll", ".exe", ".pdf",
}

# (regex, human label) -- these mean the project is not finished.
PLACEHOLDER_PATTERNS = [
    (r"\bTODO\b", "TODO marker"),
    (r"\bFIXME\b", "FIXME marker"),
    (r"\bXXX\b", "XXX marker"),
    (r"implement (?:this|it) later", "deferred implementation"),
    (r"not implemented", "unimplemented code"),
    (r"\byour code here\b", "empty code block"),
    (r"\{\{[^}\n]{1,80}\}\}", "unfilled {{template}} placeholder"),
    (r"<your[-_ ][a-z ]{0,40}>", "unfilled <your ...> placeholder"),
    (r"YOUR_API_KEY|YOUR_KEY_HERE|CHANGEME|REPLACE_ME", "unfilled credential placeholder"),
    (r"lorem ipsum", "lorem ipsum filler"),
    (r"coming soon", "unfinished feature marker"),
    (r"\.\.\.\s*$", "truncated line (ellipsis)"),
]

REMOTE_OK = ("http://", "https://", "//", "data:", "mailto:", "tel:", "blob:", "#", "javascript:")

findings = []  # (severity, code, message, path)


def add(sev, code, msg, path=None):
    findings.append({"severity": sev, "code": code, "message": msg,
                     "path": str(path) if path else None})


def walk(root: Path):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(filenames):
            out.append(Path(dirpath) / fn)
    return out


def read_text(p: Path):
    try:
        return p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None
    except OSError:
        return None


def png_size(p: Path):
    try:
        with open(p, "rb") as f:
            head = f.read(26)
    except OSError:
        return None
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def jpeg_size(p: Path):
    try:
        data = p.read_bytes()
    except OSError:
        return None
    i = 2
    if not data.startswith(b"\xff\xd8"):
        return None
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        seg = struct.unpack(">H", data[i + 2:i + 4])[0]
        i += 2 + seg
    return None


def image_size(p: Path):
    ext = p.suffix.lower()
    if ext == ".png":
        return png_size(p)
    if ext in (".jpg", ".jpeg"):
        return jpeg_size(p)
    return None


def strip_query(ref: str) -> str:
    return re.split(r"[?#]", ref, 1)[0]


def is_remote(ref: str) -> bool:
    r = ref.strip()
    return not r or any(r.startswith(x) for x in REMOTE_OK)


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------

def check_entry(root: Path, entry: str, files):
    """An entry point must exist at the archive root."""
    entry_path = root / entry
    if entry_path.is_file():
        return entry_path
    html_at_root = [f for f in files if f.parent == root and f.suffix.lower() in (".html", ".htm")]
    if html_at_root:
        add("warn", "ENTRY-RENAMED",
            f"Expected entry '{entry}' at the project root; found '{html_at_root[0].name}'. "
            f"Web packagers look for an entry at the archive root.")
        return html_at_root[0]
    add("error", "ENTRY-MISSING",
        f"No '{entry}' at the project root. The entry point must sit at the top level "
        f"of the zip, not inside a subfolder.")
    return None


def check_relative_paths(files):
    """Absolute local paths break once the project is packaged or moved."""
    pats = [
        (re.compile(r"""(?:src|href|action|poster|data)\s*=\s*["'](/(?!/)[^"']*)["']"""), "root-relative URL"),
        (re.compile(r"""url\(\s*['"]?(/(?!/)[^)'"]*)"""), "root-relative CSS url()"),
        (re.compile(r"file:///"), "file:/// reference"),
        (re.compile(r"""[A-Za-z]:\\\\|["'][A-Za-z]:\\"""), "absolute Windows path"),
    ]
    for f in files:
        if f.suffix.lower() not in TEXT_EXT:
            continue
        if is_generated_bundle(f):
            continue
        text = read_text(f)
        if text is None:
            continue
        for rx, label in pats:
            for m in rx.finditer(text):
                snippet = m.group(0)[:70].replace("\n", " ")
                add("error", "ABS-PATH",
                    f"{label}: {snippet!r} -- use './' relative paths", f)


def is_generated_bundle(path: Path) -> bool:
    """True for minified/generated output, which is not source and must not be content-scanned.

    A bundled app ships megabytes of minified library code. Scanning it for `TODO`,
    `{{template}}` or `C:\\` finds lucide icon path data and TextMate grammar regexes, not
    defects — 207 false positives on this project, which buries the real ones.

    Detected without guessing: a content-hashed filename is bundler output by definition,
    and so is a file that is one line or a handful of enormous ones.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    if len(text) < 2_000:
        return False
    if re.search(r"-[A-Za-z0-9_-]{8,}\.(js|mjs|cjs|css)$", path.name):
        return True
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False
    return len(lines) <= 2 or (len(text) / len(lines)) > 400


def check_local_refs(root: Path, files):
    """Every local asset referenced must actually exist."""
    ref_rx = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""")
    css_rx = re.compile(r"""url\(\s*['"]?([^)'"]+)['"]?\s*\)""")
    for f in files:
        if f.suffix.lower() not in (".html", ".htm", ".css"):
            continue
        text = read_text(f)
        if text is None:
            continue
        refs = ref_rx.findall(text) if f.suffix.lower() in (".html", ".htm") else []
        refs += css_rx.findall(text)
        for ref in refs:
            if is_remote(ref):
                continue
            target = strip_query(ref)
            if not target:
                continue
            resolved = (f.parent / target.lstrip("./")).resolve()
            if resolved.is_dir():
                resolved = resolved / "index.html"
            try:
                ok = resolved.exists()
            except OSError:
                ok = False
            if not ok:
                add("error", "MISSING-REF",
                    f"References '{ref}' which does not exist", f)


def check_manifest(root: Path):
    candidates = [root / "manifest.json", root / "site.webmanifest",
                  root / "manifest.webmanifest", root / "public" / "manifest.json"]
    mpath = next((c for c in candidates if c.is_file()), None)
    if mpath is None:
        add("error", "MANIFEST-MISSING",
            "No manifest.json / site.webmanifest at the project root. Browser-based "
            "APK packagers reject projects without a web app manifest.")
        return
    try:
        data = json.loads(read_text(mpath) or "")
    except json.JSONDecodeError as e:
        add("error", "MANIFEST-INVALID", f"manifest.json is not valid JSON: {e}", mpath)
        return
    if not isinstance(data, dict):
        add("error", "MANIFEST-INVALID", "manifest.json must be a JSON object", mpath)
        return

    for key in ("name", "short_name", "start_url", "display", "icons"):
        if key not in data:
            add("error", "MANIFEST-FIELD", f"manifest.json is missing required field '{key}'", mpath)
    if data.get("start_url") not in (None, "./", ".", "index.html", "./index.html"):
        add("warn", "MANIFEST-STARTURL",
            f"start_url is {data.get('start_url')!r}; './' is the safest value for a "
            f"packaged app", mpath)
    if data.get("display") not in (None, "standalone", "fullscreen", "minimal-ui"):
        add("warn", "MANIFEST-DISPLAY",
            f"display is {data.get('display')!r}; 'standalone' is what packagers expect", mpath)
    for key in ("theme_color", "background_color"):
        if key not in data:
            add("warn", "MANIFEST-FIELD", f"manifest.json has no '{key}' (splash/status bar colour)", mpath)

    icons = data.get("icons")
    if not isinstance(icons, list) or not icons:
        add("error", "ICONS-MISSING", "manifest.json 'icons' must be a non-empty array", mpath)
        return

    declared = set()
    for icon in icons:
        if not isinstance(icon, dict) or "src" not in icon:
            add("error", "ICONS-ENTRY", "An icon entry is missing 'src'", mpath)
            continue
        src = strip_query(icon["src"])
        if src.startswith(("http://", "https://", "//")):
            add("warn", "ICONS-REMOTE",
                f"Icon '{src}' is remote; bundled icons are required for offline launch", mpath)
            continue
        ipath = (mpath.parent / src.lstrip("./")).resolve()
        if not ipath.is_file():
            add("error", "ICONS-FILE", f"Icon file '{src}' declared but not found", mpath)
            continue
        # A renamed text file passes a naive existence check and fails in the
        # packager, so confirm the bytes are really an image.
        try:
            magic = ipath.read_bytes()[:8]
        except OSError:
            magic = b""
        if ipath.suffix.lower() == ".png" and magic != b"\x89PNG\r\n\x1a\n":
            add("error", "ICONS-NOT-PNG",
                f"Icon '{src}' has a .png extension but is not a PNG file", mpath)
            continue
        sizes = str(icon.get("sizes", "")).lower()
        for size in re.findall(r"(\d+)x(\d+)", sizes):
            declared.add((int(size[0]), int(size[1])))
        actual = image_size(ipath)
        if actual and "x" in sizes and sizes != "any":
            want = re.findall(r"(\d+)x(\d+)", sizes)
            if want:
                w, h = int(want[0][0]), int(want[0][1])
                if (w, h) != actual:
                    add("error", "ICONS-SIZE",
                        f"Icon '{src}' declares {w}x{h} but the file is "
                        f"{actual[0]}x{actual[1]}", mpath)
        if "type" not in icon:
            add("warn", "ICONS-TYPE", f"Icon '{src}' has no 'type' (e.g. image/png)", mpath)

    for need in ((192, 192), (512, 512)):
        if need not in declared:
            add("error", "ICONS-SIZES",
                f"manifest.json declares no {need[0]}x{need[1]} icon; Android packagers "
                f"require 192 and 512 PNG icons", mpath)

    purposes = " ".join(str(i.get("purpose", "")) for i in icons if isinstance(i, dict))
    if "maskable" not in purposes:
        add("warn", "ICONS-MASKABLE",
            "No icon declared with \"purpose\": \"maskable\"; Android will crop the "
            "launcher icon to its own shape and may clip the artwork", mpath)


def check_service_worker(root: Path, entry_path, files):
    sw_files = [p for p in root.rglob("*")
                if p.is_file() and p.name in ("sw.js", "service-worker.js", "sw.ts")]
    # Registration is often in a bundled script rather than inline in the HTML,
    # so look across every source file the page can load.
    registered = False
    for f in files:
        if f.suffix.lower() not in (".html", ".htm", ".js", ".mjs", ".cjs",
                                    ".jsx", ".ts", ".tsx"):
            continue
        if re.search(r"serviceWorker\s*\.\s*register", read_text(f) or ""):
            registered = True
            break
    if not sw_files:
        add("error", "SW-MISSING",
            "No sw.js / service-worker.js. Offline install (and therefore a clean APK "
            "launch with no network) needs a service worker.")
        return
    sw = sw_files[0]
    text = read_text(sw) or ""
    if "fetch" not in text:
        add("error", "SW-NOFETCH",
            f"{sw.name} has no 'fetch' handler, so it caches nothing at runtime", sw)
    if "caches" not in text:
        add("warn", "SW-NOCACHE", f"{sw.name} does not touch the Cache API", sw)
    if not registered:
        add("error", "SW-UNREGISTERED",
            "No navigator.serviceWorker.register(...) call in the entry file", entry_path)


def check_viewport(entry_path):
    if not entry_path or not entry_path.is_file():
        return
    text = read_text(entry_path) or ""
    m = re.search(r"""<meta[^>]+name\s*=\s*["']viewport["'][^>]*>""", text, re.I)
    if not m:
        add("error", "NO-VIEWPORT",
            "No viewport meta tag; the app will render zoomed-out on a phone", entry_path)
        return
    tag = m.group(0)
    if "width=device-width" not in tag.replace(" ", ""):
        add("error", "VIEWPORT-WIDTH",
            "viewport meta lacks width=device-width; the app renders zoomed out", entry_path)
    if "user-scalable" not in tag:
        add("error", "VIEWPORT-SCALABLE",
            "viewport meta has no user-scalable=no; pinch-zoom breaks app-like layouts "
            "inside a webview wrapper", entry_path)
    if "viewport-fit" not in tag:
        add("error", "VIEWPORT-FIT",
            "viewport meta has no viewport-fit=cover; content will not extend under the "
            "status bar or notch on a phone", entry_path)


def check_dependency_manifests(root: Path):
    pkg = root / "package.json"
    if pkg.is_file():
        try:
            data = json.loads(read_text(pkg) or "")
        except json.JSONDecodeError as e:
            add("error", "PKG-INVALID", f"package.json is not valid JSON: {e}", pkg)
            data = None
        if isinstance(data, dict):
            for key in ("name", "version"):
                if key not in data:
                    add("error", "PKG-FIELD", f"package.json is missing '{key}'", pkg)
            deps = {}
            for key in ("dependencies", "devDependencies"):
                if isinstance(data.get(key), dict):
                    deps.update(data[key])
            for name, ver in deps.items():
                if not isinstance(ver, str) or ver.strip() in ("", "*", "latest", "x"):
                    add("error", "PKG-UNPINNED",
                        f"Dependency '{name}' is not pinned to a version "
                        f"(found {ver!r}); builds drift and break", pkg)
                elif ver.strip().startswith("^") or ver.strip().startswith("~"):
                    add("warn", "PKG-CARET",
                        f"Dependency '{name}' is '{ver}'; an exact version builds "
                        f"more reliably than a range", pkg)
            if "main" not in data and not isinstance(data.get("scripts"), dict):
                add("warn", "PKG-ENTRY", "package.json defines neither 'main' nor 'scripts'", pkg)
            if "electron" in deps and "build" not in data and "electron-builder" not in deps:
                add("warn", "ELECTRON-CONFIG",
                    "Electron is a dependency but there is no 'build' block and no "
                    "electron-builder; the EXE wrap has no configuration", pkg)

    for name in ("requirements.txt",):
        rp = root / name
        if rp.is_file():
            for i, line in enumerate((read_text(rp) or "").splitlines(), 1):
                s = line.strip()
                if not s or s.startswith("#") or s.startswith("-"):
                    continue
                if not re.search(r"[=<>~!]=", s) and "==" not in s:
                    add("warn", "REQ-UNPINNED",
                        f"requirements.txt line {i} ('{s}') is unpinned", rp)

    cap = root / "capacitor.config.json"
    if cap.is_file():
        try:
            data = json.loads(read_text(cap) or "")
        except json.JSONDecodeError as e:
            add("error", "CAP-INVALID", f"capacitor.config.json is not valid JSON: {e}", cap)
        else:
            for key in ("appId", "appName", "webDir"):
                if isinstance(data, dict) and key not in data and key not in data.get("app", {}):
                    add("error", "CAP-FIELD", f"capacitor.config.json is missing '{key}'", cap)
            if isinstance(data, dict) and "webDir" not in data and "webDir" not in data.get("app", {}):
                add("warn", "CAP-WEBDIR",
                    "capacitor.config.json has no webDir; the build will not find the web assets", cap)

    cfg = root / "config.xml"
    if cfg.is_file():
        text = read_text(cfg) or ""
        if "<widget" not in text:
            add("error", "CORDOVA-WIDGET", "config.xml has no <widget> element", cfg)
        if "<name" not in text:
            add("error", "CORDOVA-NAME", "config.xml has no <name> element", cfg)


def check_placeholders(files):
    for f in files:
        if f.suffix.lower() not in TEXT_EXT:
            continue
        if is_generated_bundle(f):
            continue
        text = read_text(f)
        if text is None:
            continue
        for rx, label in PLACEHOLDER_PATTERNS:
            for m in re.finditer(rx, text, re.I | re.M):
                line = text[:m.start()].count("\n") + 1
                snippet = text.splitlines()[line - 1].strip()[:70] if line - 1 < len(text.splitlines()) else ""
                add("error", "PLACEHOLDER",
                    f"{label} at line {line}: {snippet!r}", f)


def check_integrity(files):
    for f in files:
        try:
            size = f.stat().st_size
        except OSError:
            continue
        if size == 0 and f.name not in (".gitkeep", ".nojekyll"):
            add("error", "EMPTY-FILE", "File is empty", f)
        elif size > 8 * 1024 * 1024:
            add("warn", "LARGE-FILE",
                f"{size / 1048576:.1f} MB -- browser packagers and free upload tiers "
                f"often cap total zip size", f)
        if f.suffix.lower() in TEXT_EXT:
            try:
                f.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                add("warn", "ENCODING", "File is not valid UTF-8", f)
            except OSError:
                pass


def check_network_calls(files):
    for f in files:
        if f.suffix.lower() not in TEXT_EXT:
            continue
        text = read_text(f)
        if text is None:
            continue
        for pat, label in ((r"https?://localhost", "localhost URL"),
                           (r"https?://127\.0\.0\.1", "loopback URL")):
            if re.search(pat, text):
                add("error", "LOCAL-URL",
                    f"{label} is hardcoded; it resolves to the phone itself, not a server", f)
        for m in re.finditer(r"""<script[^>]+src\s*=\s*["']https?://[^"']+["']""", text):
            add("warn", "REMOTE-SCRIPT",
                f"Remote script {m.group(0)[:60]}... -- the app breaks with no network "
                f"unless it is bundled", f)
            break


def check_python_entry(root: Path):
    pys = list(root.glob("*.py"))
    if pys and not any((root / n).is_file() for n in ("requirements.txt", "pyproject.toml", "setup.py")):
        add("warn", "PY-DEPS", "Python files at root but no requirements.txt / pyproject.toml")
    for p in pys:
        if "__main__" in (read_text(p) or "") and p.name in ("main.py", "app.py", "run.py"):
            return
    if pys and (root / "main.py").is_file() is False and (root / "app.py").is_file() is False:
        add("warn", "PY-ENTRY",
            "No main.py / app.py entry point; PyInstaller needs one file to target")


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Validate a project before packaging.")
    ap.add_argument("project", help="project directory")
    ap.add_argument("--entry", default="index.html", help="expected entry file at root")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    root = Path(args.project).expanduser().resolve()
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        return 2

    files = walk(root)
    if not files:
        print(f"No files under {root}", file=sys.stderr)
        return 2

    entry_path = check_entry(root, args.entry, files)
    check_relative_paths(files)
    check_local_refs(root, files)
    check_manifest(root)
    check_service_worker(root, entry_path, files)
    check_viewport(entry_path)
    check_dependency_manifests(root)
    check_placeholders(files)
    check_integrity(files)
    check_network_calls(files)
    check_python_entry(root)

    errors = [f for f in findings if f["severity"] == "error"]
    warns = [f for f in findings if f["severity"] == "warn"]

    if args.json:
        print(json.dumps({"project": str(root), "file_count": len(files),
                          "errors": errors, "warnings": warns,
                          "ok": not errors}, indent=2))
        return 1 if errors else 0

    print(f"Project: {root}")
    print(f"Files:   {len(files)}")
    print()
    if errors:
        print(f"ERRORS ({len(errors)}) -- fix these before packaging:")
        for f in errors:
            where = f" [{f['path']}]" if f["path"] else ""
            print(f"  x {f['code']}: {f['message']}{where}")
        print()
    if warns:
        print(f"WARNINGS ({len(warns)}):")
        for f in warns:
            where = f" [{f['path']}]" if f["path"] else ""
            print(f"  ! {f['code']}: {f['message']}{where}")
        print()
    if not errors and not warns:
        print("PASS -- structure, manifest, icons, service worker and file integrity all check out.")
    elif not errors:
        print("PASS with warnings -- safe to package; review the warnings above.")
    else:
        print(f"FAIL -- {len(errors)} error(s). The zip is not ready to package.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
