# Governed Action Request Contract

## Purpose

This contract defines the real product request shape for governed external actions that must be evaluated unchanged across `baseline` and `aimxs-full`.

This contract is intended for recordable in-product workflows. It is not a hidden test hook.

## Rules

1. The same request shape must be sent across `baseline` and `aimxs-full`.
2. Provider differentiation must come from standard fields, not hidden probe markers.
3. The product must persist and display the exact provider response for the real run or thread.
4. Finance or paper-trading demos may use this contract, but the contract itself is generic.

## Request Shape

```json
{
  "meta": {
    "requestId": "governed-action-...",
    "timestamp": "2026-03-10T00:00:00Z",
    "tenantId": "tenant-demo",
    "projectId": "project-demo",
    "environment": "dev",
    "actor": "desktop-governed-action"
  },
  "subject": {
    "type": "user",
    "id": "operator-001",
    "attributes": {
      "approvedForProd": false
    }
  },
  "action": {
    "type": "trade.execute",
    "class": "execute",
    "verb": "execute",
    "target": "paper-trade-001"
  },
  "resource": {
    "kind": "broker-order",
    "class": "external_actuator",
    "namespace": "epydios-system",
    "name": "paper-trade-001",
    "id": "paper-trade-001"
  },
  "context": {
    "governed_action": {
      "contract_id": "epydios.governed-action.v1",
      "workflow_kind": "external_action_request",
      "request_label": "Paper Trade Request",
      "demo_profile": "finance_paper_trade",
      "origin_surface": "future_product_workflow"
    },
    "policy_stratification": {
      "policy_bucket_id": "desktop-governed-action",
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
```

## Current Implementation

- Shared builder: [governed-action-contract.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/runtime/governed-action-contract.js)
- Local AIMXS full provider shim: [aimxs-full-provider.py](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/bin/aimxs-full-provider.py)

## Current Scope

This contract is defined and shared now. The next product work is to attach it to a first-class operator workflow and render the raw returned policy richness directly in-product.
