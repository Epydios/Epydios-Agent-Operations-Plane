# M15 Native App Delivery Plan

Status: in_progress  
Baseline date: 2026-03-06 (start now)

## Goal

Ship a packaged desktop application (no external browser dependency) with parity guardrails for:

1. Linux (priority) + K8s operator flows
2. macOS (early beta priority for operator testing)
3. Windows

## Current State

- UI module is consolidated in-repo at `ui/desktop-ui`.
- Current runtime is web-served and opened in a browser.

## Delivery Phases (Immediate Execution)

### Phase A: Packaging foundation and runtime boundary (in progress now)

1. Select native shell framework and lock contract:
   - Chosen: Wails (Go-native bridge, aligns with current Go-heavy stack)
2. Define app process model:
   - embedded UI bundle
   - local runtime process lifecycle
   - structured logs path + crash dump path
3. Add verifier set:
   - app starts without browser
   - sandbox profile enforced by default
   - restricted-host remains deny by default

Exit gate:
- packaged app launches with embedded UI and passes M13/M14 policy/verify loop in mock mode.

### Phase B: Linux-first execution packaging (next active phase)

1. Linux package formats:
   - AppImage + tarball baseline
   - optional DEB/RPM in same phase if build pipeline is stable
2. Linux adapter hardening:
   - Openfang adapter path in sandbox profile
   - verifier matrix for observe/actuate/verify and deny paths
3. K8s-facing operator integration smoke:
   - endpoint routing
   - policy grant + approval loop
   - evidence emission integrity

Exit gate:
- Linux packaged app runs end-to-end in sandbox_vm_autonomous profile with all daily verifiers green.

### Phase C: macOS packaged beta (after Linux packaging baseline)

1. `.app` packaging and launch tooling:
   - local install/uninstall scripts
   - runtime config bootstrap
2. macOS profile enforcement:
   - restricted_host deny default
   - sandbox profile as autonomous baseline
3. Operator beta checklist:
   - startup reliability
   - approvals/runs/incidents/settings paths
   - incident export + audit handoff

Exit gate:
- macOS packaged app is beta-test ready for operator use with no browser dependency.

### Phase D: Windows parity (after macOS beta path is stable)

1. Packaging:
   - MSI or signed installer
2. Capability parity:
   - desktop provider contract parity with Linux/macOS (observe/actuate/verify + deny paths)
3. Windows-specific verifier matrix:
   - approval gating
   - restricted-host enforcement
   - evidence artifact consistency

Exit gate:
- Windows packaged app reaches feature and verifier parity with macOS/Linux baseline.

## Gating Rules (Do Not Relax)

1. `restricted_host` remains blocked by default.
2. Autonomous mode defaults to sandbox/VM profile.
3. Policy/evidence/audit remains mandatory per action step.
4. Provider integrations continue to honor the versioned extension boundary.

## Immediate Next Step

Start Phase A implementation immediately behind existing DesktopProvider contract; no policy-model broadening in this phase.
