#!/usr/bin/env python3
"""Lint CI configuration before trusting it.

    python3 scripts/ci_lint.py lint --file .gitlab-ci.yml --file .woodpecker.yml

Why this exists: a duplicate mapping key makes a CI provider reject the whole file
("failed to parse workflow"), and the run then dies in seconds with no steps — which
looks exactly like an infrastructure problem rather than a typo. Python's YAML parser
silently keeps the last duplicate, so a normal `yaml.safe_load` does not catch it.

Checks performed, per file type:
  * YAML parses at all
  * no duplicate mapping keys anywhere in the file
  * the top level is a mapping
  * GitLab CI:    `stages` (when jobs are present) and every job has a `stage` + `script`
  * Woodpecker:   a `steps` mapping whose entries each have `image` or `commands`
  * GitHub:       `on`, `jobs`, and every job has `runs-on` and `steps`

Exits non-zero when anything is wrong, so it can gate a pipeline.
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - the CI images install pyyaml
    print("pyyaml is required: pip install pyyaml", file=sys.stderr)
    raise SystemExit(2)


class StrictLoader(yaml.SafeLoader):
    """A SafeLoader that refuses duplicate keys, the way CI providers do."""


def _no_duplicates(loader: StrictLoader, node: yaml.MappingNode, deep: bool = False) -> dict:
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                None, None,
                f"duplicate key {key!r} at line {key_node.start_mark.line + 1}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _no_duplicates)


def classify(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name in (".gitlab-ci.yml", "gitlab-ci.yml"):
        return "gitlab"
    if name in (".woodpecker.yml", ".woodpecker.yaml", "woodpecker.yml"):
        return "woodpecker"
    if "/.github/workflows/" in path or name.endswith(".yml") and "workflow" in name:
        return "github"
    if path.endswith((".yml", ".yaml")):
        return "github" if "workflows" in path else "generic"
    return "generic"


def lint_gitlab(doc: dict) -> list[str]:
    problems: list[str] = []
    jobs = {k: v for k, v in doc.items() if isinstance(v, dict) and k not in ("default", "variables", "include", "workflow", "stages", "cache")}
    if jobs and "stages" not in doc:
        problems.append("has jobs but no top-level `stages`")
    for name, job in jobs.items():
        if "script" not in job and "trigger" not in job and "extends" not in job:
            problems.append(f"job `{name}` has no `script`")
        if "stage" not in job and "stages" in doc:
            problems.append(f"job `{name}` has no `stage`")
    return problems


def lint_woodpecker(doc: dict) -> list[str]:
    problems: list[str] = []
    steps = doc.get("steps")
    if not isinstance(steps, dict) or not steps:
        return ["has no `steps` mapping"]
    for name, step in steps.items():
        if not isinstance(step, dict):
            problems.append(f"step `{name}` is not a mapping")
            continue
        if "commands" not in step and "image" not in step:
            problems.append(f"step `{name}` has neither `commands` nor `image`")
    return problems


def lint_github(doc: dict) -> list[str]:
    problems: list[str] = []
    if True not in doc and "on" not in doc:
        problems.append("has no `on:` trigger")
    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        return problems + ["has no `jobs` mapping"]
    for name, job in jobs.items():
        if not isinstance(job, dict):
            problems.append(f"job `{name}` is not a mapping")
            continue
        if "runs-on" not in job and "uses" not in job:
            problems.append(f"job `{name}` has no `runs-on`")
        steps = job.get("steps")
        if steps is not None:
            for index, step in enumerate(steps):
                if not isinstance(step, dict):
                    problems.append(f"job `{name}` step {index} is not a mapping")
                    continue
                if "uses" not in step and "run" not in step:
                    problems.append(f"job `{name}` step {index} has neither `uses` nor `run`")
        if "timeout-minutes" not in job:
            problems.append(f"job `{name}` has no `timeout-minutes`")
    return problems


LINTERS = {"gitlab": lint_gitlab, "woodpecker": lint_woodpecker, "github": lint_github}


def lint_file(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8") as handle:
            raw = handle.read()
    except OSError as error:
        return [f"cannot read: {error}"]

    try:
        doc = yaml.load(raw, Loader=StrictLoader)
    except yaml.YAMLError as error:
        return [f"invalid YAML: {error}"]

    if doc is None:
        return ["file is empty"]
    if not isinstance(doc, dict):
        return ["top level is not a mapping"]

    kind = classify(path)
    return LINTERS.get(kind, lambda _doc: [])(doc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lint CI configuration.")
    sub = parser.add_subparsers(dest="command", required=True)
    lint = sub.add_parser("lint", help="lint one or more files")
    lint.add_argument("--file", action="append", required=True, help="path to lint (repeatable)")

    args = parser.parse_args(argv)
    failed = False
    for path in args.file:
        problems = lint_file(path)
        if problems:
            failed = True
            print(f"FAIL  {path}")
            for problem in problems:
                print(f"        - {problem}")
        else:
            print(f"OK    {path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
