# Genei AI — Python AI Director Orchestration Package

A provider-neutral Python package for autonomous, long-form video creation, scene-by-scene script decomposition, character consistency, voice generation, video orchestration, ellipse-based quality assurance, upscaling, and stitching.

## Features

- **Scene-by-scene script decomposition:** converts a text brief into a versioned scene and shot graph.
- **BYOK & BYOH routing:** selects between cloud provider adapters and local hardware runners based on privacy and cost policies.
- **Character lock & QA:** checks face and landmark regions using ellipse scan scoring.
- **Resumable pipeline:** state machine designed for multi-scene and multi-session generation.

## Usage

```bash
python -m ai_director.cli --brief "A cinematic documentary on cosmic exploration" --policy prefer_local
```

## Running Tests

```bash
pytest ai_director/test_director.py
```
