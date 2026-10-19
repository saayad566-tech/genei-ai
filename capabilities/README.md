# Capability registry

The APEX-X capability registry for this project, kept **in the repository** on purpose.

## Why here

The registry tool defaults to `./capability-registry.json` relative to the working
directory, and the skill's sandbox directory is recreated from its package every session.
A registry written there does not survive, so a weekly review reported "empty" every week
and could never accumulate history.

The repository is the one location that survives a new session, a package reset, a sandbox
recycle and a fresh clone. So the registry lives here, is versioned with the code, and its
history is reviewable in the same place as everything else.

## Always pass the path

Every command must point at this file explicitly, or it will write somewhere that is lost:

```sh
REG=capabilities/registry.json
python3 scripts/capability_registry.py --registry "$REG" check
python3 scripts/capability_registry.py --registry "$REG" list
python3 scripts/capability_registry.py --registry "$REG" verify-audit
python3 scripts/capability_registry.py --registry "$REG" lessons
```

## Files

| File | What it is |
|---|---|
| `registry.json` | The authoritative registry: capabilities, statuses and evidence |
| `registry.json.audit.jsonl` | Hash-chained append-only audit log |
| `plans/*.json` | Reviewed plans that approvals bind to, by hash |
| `hf-verify.mjs` | The verification command for the Hugging Face Hub capability |

## Rules

- **Never reset or fabricate history.** The audit chain is hash-chained; `verify-audit`
  detects an edit or a deletion. Preserve it.
- **A capability is not verified until `verify` runs a real command and it exits 0.**
  A declaration-only `verified` is flagged by `check`.
- **A protected capability** (external kind, or high/critical risk) needs a reviewed plan
  whose `plan_hash` the approval binds to, and the approver must not be the executor.
- `llama-cpp` is recorded as `installed` and **not** verified: the binary is not present
  in every environment, so the honest status is that it is installed but unproven here.
