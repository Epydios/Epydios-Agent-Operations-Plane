# Manual OSS vs AIMXS Full Side-by-Side

This runbook is the manual version of the scripted AIMXS richness probe. It compares `oss-only` and `aimxs-full` on the same local stack and uses the same policy-evaluation payload for both providers.

This is a provider-level troubleshooting exercise, not a Desktop UI-only or chat-driven self-verification flow. Do not use it to claim that a field-only operator richness path already exists.

## Preconditions

- Terminal 1 is running the local runtime:
  - `./ui/desktop-ui/bin/run-local-runtime-macos.sh --ref-values-path "..."`
  - or your normal equivalent
- Terminal 2 is running the live desktop UI against the local runtime:
  - `./ui/desktop-ui/bin/run-macos-local.sh --mode live --runtime-base-url "http://127.0.0.1:18080"`
- `http://127.0.0.1:4173/` is loading
- `jq`, `curl`, and `kubectl` are available locally

## What “mode loop” means

For the current local troubleshooting path, it means:

1. Activate `oss-only` in `Settings -> Configuration -> AIMXS Deployment Contract`
2. Observe the live status and run the manual OSS probe
3. Activate `aimxs-full`
4. Observe the live status and run the manual AIMXS probe
5. Switch back to `oss-only`

That is the loop. It is just controlled mode switching plus repeatable checks.

`aimxs-https` is intentionally omitted from this runbook.

## Step 1: Activate OSS-only

In the Desktop UI:

1. Open `Settings -> Configuration`
2. Under `AIMXS Deployment Contract`, choose `oss-only`
3. Click `Activate AIMXS Mode`
4. Confirm the activation summary shows `oss-only`

## Step 2: Prepare one shared probe payload

Create a temp file:

```bash
cat >/tmp/agentops-aimxs-richness-probe.json <<'JSON'
{
  "meta": {
    "requestId": "aimxs-richness-manual-001",
    "timestamp": "2026-03-09T00:00:00Z",
    "tenantId": "demo-tenant",
    "projectId": "demo-project",
    "environment": "dev",
    "actor": "desktop-richness-manual"
  },
  "subject": {
    "type": "user",
    "id": "alice-richness-probe",
    "attributes": {
      "approvedForProd": false
    }
  },
  "action": {
    "type": "trade.execute",
    "class": "execute",
    "verb": "execute",
    "target": "broker-order"
  },
  "resource": {
    "kind": "broker-order",
    "class": "external_actuator",
    "namespace": "epydios-system",
    "name": "order-probe-001",
    "id": "order-probe-001"
  },
  "context": {
    "governed_action": {
      "contract_id": "epydios.governed-action.v1",
      "workflow_kind": "external_action_request",
      "request_label": "AIMXS Manual Side-by-Side",
      "demo_profile": "finance_paper_trade",
      "origin_surface": "manual_provider_runbook"
    },
    "policy_stratification": {
      "policy_bucket_id": "richness-trade-probe",
      "action_class": "execute",
      "boundary_class": "external_actuator",
      "risk_tier": "high",
      "required_grants": [
        "grant.trading.supervisor"
      ],
      "evidence_readiness": "PARTIAL",
      "gates": {
        "core09.gates.default_off": true,
        "core09.gates.required_grants_enforced": true,
        "core09.gates.evidence_readiness_enforced": true,
        "core14.adapter_present.enforce_handshake": true
      }
    }
  },
  "mode": "enforce",
  "dryRun": false
}
JSON
```

## Step 3: Inspect OSS capabilities

Open a new terminal and port-forward the OSS provider:

```bash
kubectl -n epydios-system port-forward svc/epydios-oss-policy-provider 18081:8080
```

In another terminal:

```bash
curl -sSf http://127.0.0.1:18081/v1alpha1/capabilities | jq
```

Expected OSS capability shape:

- `providerId` is `oss-policy-opa`
- `capabilities` includes `policy.evaluate` and `policy.validate_bundle`
- `capabilities` does **not** include `governance.handshake_validation`
- `capabilities` does **not** include `evidence.policy_decision_refs`
- `capabilities` does **not** include `policy.defer`

## Step 4: Evaluate the payload against OSS

```bash
curl -sSf \
  -H 'Content-Type: application/json' \
  -X POST \
  --data-binary @/tmp/agentops-aimxs-richness-probe.json \
  http://127.0.0.1:18081/v1alpha1/policy-provider/evaluate | jq
```

Expected OSS result:

- `decision` is `ALLOW`
- `output.engine` is `opa`
- there is no `output.aimxs`
- there is no `DEFER`

## Step 5: Activate AIMXS full

Back in the Desktop UI:

1. Open `Settings -> Configuration`
2. Under `AIMXS Deployment Contract`, choose `aimxs-full`
3. Click `Activate AIMXS Mode`
4. Confirm the activation summary shows `aimxs-full`

## Step 6: Inspect AIMXS full capabilities

```bash
curl -sSf http://127.0.0.1:4271/v1alpha1/capabilities | jq
```

Expected AIMXS capability shape:

- `providerId` is `aimxs-full`
- `capabilities` includes `governance.handshake_validation`
- `capabilities` includes `evidence.policy_decision_refs`
- `capabilities` includes `policy.defer`

## Step 7: Evaluate the same payload against AIMXS full

```bash
curl -sSf \
  -H 'Content-Type: application/json' \
  -X POST \
  --data-binary @/tmp/agentops-aimxs-richness-probe.json \
  http://127.0.0.1:4271/v1alpha1/policy-provider/evaluate | jq
```

Expected AIMXS full result:

- `decision` is `DEFER`
- `output.aimxs.providerMeta.baak_engaged` is `true`
- `output.aimxs.providerMeta.policy_stratification.boundary_class` is `external_actuator`
- `output.aimxs.evidence.evidence_hash` exists
- `evidenceRefs` exists and is non-empty

## Step 8: Optional AIMXS-only handshake supplement

This proves the AIMXS adapter seam rejects missing handshake when the gate is enforced.

```bash
python3 - <<'PY'
import json
import sys
from pathlib import Path

root = Path("/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/AIMXS/AIMXS_CORE_PACK_v74/EXTRACTED")
addon = root / "CANONICAL_INPUTS" / "AIMXS_INTEGRATION_RUNTIME_ADDON_v1"
sample_path = addon / "CORE09_CORE14_HOOKS_ONLY_SAMPLE_CALLS_v2.json"
sys.path.insert(0, str(addon))

from ILB_AIMX_GOVERNANCE_PROVIDER_ADAPTER_v25 import GovernanceProviderAdapter

with sample_path.open("r", encoding="utf-8") as handle:
    payload = json.load(handle)

adapter = GovernanceProviderAdapter()
missing_rsp = adapter.handle(payload["on_path_missing_handshake_fails"]["request"])
valid_rsp = adapter.handle(payload["on_path_valid_handshake_passes"]["request"])

print(json.dumps({
    "missing": missing_rsp,
    "valid": valid_rsp
}, indent=2))
PY
```

Expected handshake supplement result:

- `missing.status` is `ERROR`
- `missing.error_code` is `CORE14_HANDSHAKE_INVALID`
- `valid.status` is `OK`

## Step 9: Return to OSS-only

Back in the Desktop UI:

1. Choose `oss-only`
2. Click `Activate AIMXS Mode`
3. Confirm the activation summary shows `oss-only`

## Interpretation

If the runbook behaves as expected:

- OSS is still the simple baseline path
- AIMXS full is returning richer governance behavior
- the local `aimxs-full` path is not secretly bootstrapping back to OSS

If anything deviates:

- use `./ui/desktop-ui/bin/verify-m21-aimxs-richness.sh` first
- if the manual runbook and the scripted verifier disagree, the disagreement itself is a bug worth fixing
