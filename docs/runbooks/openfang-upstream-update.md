# Openfang Upstream Update Workflow

This runbook defines a controlled update path for Openfang upstream releases while preserving M13/M14 guardrails.

## Inputs

- Pin file: `provider-reference/desktop/openfang/upstream-pin.json`
- Upstream repo: `https://github.com/RightNow-AI/openfang.git`

## Drift Check

Run drift check against the pin:

```bash
./platform/local/bin/check-openfang-upstream-drift.sh
```

Fail on drift (for strict checks):

```bash
FAIL_ON_DRIFT=1 ./platform/local/bin/check-openfang-upstream-drift.sh
```

## Update Procedure

1. Fetch latest upstream tags in the local intake cache:

```bash
git -C "SUBSTRATE_UPSTREAMS/DESKTOP_EXECUTION_PLANE/openfang" fetch --tags origin
```

2. Select target tag and resolve commit:

```bash
TAG="v0.3.17"
COMMIT="$(git -C "SUBSTRATE_UPSTREAMS/DESKTOP_EXECUTION_PLANE/openfang" rev-parse "${TAG}^{}")"
echo "TAG=${TAG} COMMIT=${COMMIT}"
```

3. Update `provider-reference/desktop/openfang/upstream-pin.json`:
- `trackedTag`
- `trackedCommit`
- `lastVerifiedAtUtc`
- optional `latestObservedTag`/`latestObservedCommit`

4. Run required guardrail checks:

```bash
./platform/local/bin/verify-m13-openfang-adapter.sh
./platform/local/bin/verify-m13-openfang-runtime-integration.sh
./platform/local/bin/verify-m13-desktop-daily-loop.sh
./platform/local/bin/verify-m13-m14-closeout-bundle.sh
```

5. Update governance artifacts:
- `PIPELINE_LIVING.txt`
- `PIPELINE_LIVING.json`
- `folder_manifest.json`

## Promotion Rule

Do not change active provider defaults or broaden host autonomy based only on new upstream tags.
Upstream updates remain manual and gated by verifier evidence.
