# AI Director Master Specification — Planning Notes

Source: `/home/ubuntu/upload/AI_Director_200_Point_Master_Specification.docx`

The specification describes a local-first, open-source, self-healing AI orchestration platform rather than a chatbot or collection of disconnected model wrappers. Its required architecture is:

> Desktop UI → Application Kernel → Orchestration Kernel → Project Brain → Production Constitution → Planner/DAG → Agent Managers → Capability/Model Router → Sandboxed Tools/Models → QC/Repair → Editing/Rendering → Export.

The end-to-end production pipeline is:

> INGEST → SOURCE VALIDATION → STORY/AUDIO ANALYSIS → PROJECT BRAIN → PRODUCTION CONSTITUTION → CHARACTER/VOICE/LOCATION/PROP BIBLES → SCREENPLAY/ADAPTATION → SCENE GRAPH → SHOT LIST → STORYBOARD/ANIMATIC → WORKFLOW COMPILATION → MODEL ROUTING → GENERATION → TECHNICAL/VISUAL/IDENTITY/TEMPORAL/AUDIO QC → REPAIR/REGENERATION → APPROVAL → EDIT → VFX → SOUND → COLOUR → MASTER → UPSCALE → FINAL QC → EXPORT → ARCHIVE.

Critical design rules extracted from the specification:

1. Generation must happen at scene, shot, and asset level, never as one uncontrolled movie-generation request.
2. Every scene and shot needs an explicit contract, continuity context, references, acceptance criteria, provenance, and QC result. Regeneration should target the smallest failed unit.
3. The platform needs a Project Brain, Production Constitution, persistent DAG/job queue, typed agent protocol, versioned asset lineage, logging, QC/repair, permissions, and sandboxed tools/models.
4. Open-source tools/models are plugins. The platform detects hardware, handles installation/update/rollback/dependency repair/licensing/tool permissions, and routes work through BYOH/BYOK capabilities.
5. The 200-point specification covers causal story intelligence, story/project knowledge graphs, source-fidelity and hallucination checks, canon-versus-creative additions, pacing, character DNA/avatar lock, identity embeddings, voice DNA, emotion timelines, performance evaluation, world bible, environment state, prop/vehicle/weather continuity, scene graph, shot planning, motion consistency, temporal consistency, audio/lip-sync checks, technical/visual/identity/audio QC, repair/regeneration, editing/rendering, upscale, export, and archive.

Continuity feature required by the user: in clip-to-clip generation, the ending state of one clip must become the starting state of the next. For example, if a character is walking forward at the end of Scene 1, Scene 2 must inherit the character's last position, direction, gait phase, camera relationship, environment, lighting, wardrobe, props, and narrative intent instead of restarting an unrelated walking cycle.

Recommended continuity-state contract for each clip boundary:

| State group | Required fields |
|---|---|
| Narrative | scene/shot IDs, objective, unresolved action, dialogue beat, emotional state, causal handoff |
| Character | identity/reference ID, face/appearance lock, pose, screen position, facing direction, gait/action phase, gaze, expression, wardrobe, physical condition |
| World | location ID, geography/layout, time-of-day, weather, lighting direction/color, environmental motion, continuity of props/vehicles |
| Camera | shot size, lens/FOV, camera position, orientation, motion vector, horizon/axis, depth-of-field intent |
| Audio | dialogue cursor, voice ID, ambience, music beat/timecode, sound effects, lip-sync timing |
| Technical | fps, resolution, seed/model, reference assets, color space, aspect ratio, provenance, QC scores |

Recommended clip handoff process:

1. Generate Scene N with a structured shot contract.
2. Analyze the final frames and audio: detect subject tracks, pose/action phase, camera transform, depth/optical flow, environment and prop state, facial identity, lip-sync cursor, and audio beat/timecode.
3. Write a `ContinuityPacket` containing the extracted end state, confidence values, reference-frame URI, and unresolved constraints.
4. Use that packet as mandatory conditioning for Scene N+1. Generate a short bridge/overlap when the next model cannot accept a final frame or motion state directly.
5. Run transition QC on the boundary rather than only on each isolated clip. Compare identity, location, motion direction, camera axis, lighting, wardrobe/props, audio timing, and action causality.
6. If the boundary fails, regenerate only the smallest failed shot/bridge, preserving approved upstream assets.

Anti-AI-artifact warning categories to surface in the UI and QC logs:

- identity drift, face/wardrobe/prop changes, extra or missing fingers/limbs, malformed text/logos, texture crawling, flickering shadows, unstable geometry, inconsistent reflections, impossible motion, foot sliding, gait resets, teleporting objects, camera-axis jumps, exposure/white-balance shifts, frame interpolation ghosts, lip-sync phoneme mismatch, room tone discontinuity, abrupt music/beat changes, over-smoothed faces, temporal shimmer, and unsupported claims of physical realism.

The user-facing product should explain that realism is improved through references, continuity packets, bridge frames, deterministic seeds where supported, overlap handles, multi-pass generation, temporal/identity/audio QC, and targeted repair—not by promising that generated content is indistinguishable from real footage.
