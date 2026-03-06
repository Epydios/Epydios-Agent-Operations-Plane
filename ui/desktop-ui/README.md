# Epydios AgentOps Desktop

`Epydios AgentOps Desktop` is the separate operator UI module for the Epydios control plane.

This module is intentionally outside `EPYDIOS_AI_CONTROL_PLANE` to keep backend/runtime release velocity independent from UI release cadence.

## Module Boundary (non-negotiable)

- UI consumes control-plane APIs over HTTPS (Gateway/Ingress).
- UI does not import control-plane backend code directly.
- UI does not connect directly to Postgres/CNPG.
- Auth uses the same OIDC/JWT issuer and audience model as runtime API.
- AIMXS remains external and is surfaced through provider status/events, not linked into UI code.

## Initial Product Positioning

- Backend product: `Epydios AgentOps Control Plane` (technical descriptor).
- UI product: `Epydios AgentOps Desktop` (operator-facing desktop/web app).

This naming keeps the backend accurate while giving the user-facing layer a stronger product identity.

## M0 Goals

- Operator login (OIDC)
- Health and gate status dashboard
- Provider registry view (ready/probed/errors)
- Runtime run list/detail for tenant/project scope
- Audit event stream view (read-only)

Detailed scope: `M0_SCOPE.md`.

## M1 Scaffold (Implemented)

- Static web shell with dashboard layout:
  - `web/index.html`
  - `web/css/main.css`
- OIDC bootstrap skeleton + token/session handling:
  - `web/js/oidc.js`
- Config loader and runtime overrides:
  - `web/js/config.js`
  - `web/config/runtime-config.json`
  - `web/config/runtime-config.example.json`
- API client skeleton (health/providers/pipeline status):
  - `web/js/api.js`
- App wiring and refresh/login/logout flow:
  - `web/js/main.js`
- Local run/check scripts:
  - `bin/run-dev.sh`
  - `bin/check-m1.sh`

## M2 Runtime + Audit Views (Implemented)

- Runtime runs table with tenant/project filters and run-detail drill-in:
  - `web/index.html`
  - `web/js/main.js`
  - `web/js/api.js`
- Audit event table with tenant/project/provider/decision filters:
  - `web/index.html`
  - `web/js/main.js`
  - `web/js/api.js`
- Runtime endpoint mappings for runs/audit:
  - `web/config/runtime-config.json`
  - `web/config/runtime-config.example.json`
  - `web/js/config.js`

Notes:
- Runtime currently exposes `/v1alpha1/runtime/runs` and `/v1alpha1/runtime/runs/{id}`.
- If `/v1alpha1/runtime/audit/events` is unavailable, UI falls back to synthetic audit rows derived from run summaries.

## M3 OIDC Hardening (Implemented)

- Authorization code flow + PKCE scaffolding:
  - `web/js/oidc.js`
- Compatibility fallback to hash-token flow when configured (`responseType=token`).
- Config-driven auth endpoints and PKCE switch:
  - `web/config/runtime-config.json`
  - `web/config/runtime-config.example.json`
  - `web/js/config.js`

## M4 Deployment Pack (Implemented)

- Container packaging:
  - `Dockerfile`
  - `deploy/nginx/default.conf`
- Kubernetes base:
  - `deploy/base/kustomization.yaml`
  - `deploy/base/deployment.yaml`
  - `deploy/base/service.yaml`
  - `deploy/base/configmap-runtime-config.yaml`
- Production overlay (Gateway route + HA replicas + runtime config patch):
  - `deploy/overlays/production/kustomization.yaml`
  - `deploy/overlays/production/patch-deployment.yaml`
  - `deploy/overlays/production/patch-runtime-config.yaml`
  - `deploy/overlays/production/httproute.yaml`
- Deployment guide:
  - `deploy/README.md`

## M14.1 UI Architecture Boundaries (Implemented Baseline)

- Stateful store and module split:
  - `web/js/state/store.js`
  - `web/js/runtime/choices.js`
  - `web/js/views/common.js`
  - `web/js/views/session.js`
  - `web/js/views/health.js`
  - `web/js/views/providers.js`
  - `web/js/views/runs.js`
  - `web/js/views/audit.js`
  - `web/js/views/execution-defaults.js`
  - `web/js/main.js`
- Locked default behavior for non-blocking runtime choices:
  - Realtime transport: `polling` (`5000ms`) with `sse` option reserved.
  - Terminal mode: `interactive_sandbox_only`, with `restricted_host` blocked by default.
  - Integration routing: `gateway_first` (`litellm`) with optional direct-provider fallback.
- Runtime-visible decision surface:
  - `Execution Defaults` panel in `web/index.html`.

## M14.2 Run Builder + Approvals Queue (Implemented)

- Policy-aware Run Builder:
  - Builds governed `POST /v1alpha1/runtime/runs` payloads with desktop tier/profile/capability fields.
  - Surfaces guardrail hints for `tier=3`, `restricted_host`, and non-Linux targets.
  - Files:
    - `web/index.html`
    - `web/js/views/run-builder.js`
    - `web/js/main.js`
    - `web/js/api.js`
- Tier-3 approval queue:
  - Endpoint-first path (`endpoints.approvalsQueue`, `endpoints.approvalDecisionPrefix`) with derived fallback from run metadata when runtime approval endpoints are unavailable.
  - Approve/deny action wiring with TTL/reason inputs.
  - Files:
    - `web/index.html`
    - `web/js/views/approvals.js`
    - `web/js/main.js`
    - `web/js/api.js`
    - `web/config/runtime-config.json`
    - `web/config/runtime-config.example.json`
    - `web/js/config.js`
- Integrations + settings surface:
  - Endpoint contract matrix for runs/run-detail/audit/approvals/approval-decision.
  - Theme mode preference (`system|light|dark`) with local persistence.
  - Agent profile selection with provider-contract labels for OpenAI-compatible, Anthropic, Google, Azure OpenAI, and Bedrock paths.
  - Provider contract matrix with per-profile transport/model/endpoint reference and credential reference scope (reference-only, no raw secrets in UI payloads).
  - Gateway security reference panel for bearer-token and mTLS certificate/key references.
  - Project-scoped integrations editor with draft save/apply/reset flow, strict `ref://` validation, and raw-secret pattern blocking.
  - M14.8 IP-governance alignment verifier path ensures UI new-IP surfaces are registered with required review metadata in the shared intake register.
  - AIMXS provider status summary from provider registry payload.
  - Files:
    - `web/index.html`
    - `web/js/views/settings.js`
    - `web/js/main.js`
    - `web/js/api.js`
    - `web/js/runtime/choices.js`
    - `web/config/runtime-config.json`
    - `web/config/runtime-config.example.json`
- Terminal safety surface:
  - Run-scoped command submission with explicit safety posture rendering (`terminalMode`, `restrictedHostMode`).
  - Policy-aware guards for blocked restricted-host requests and read-only enforcement.
  - Command provenance tagging + audit filter linkage for terminal events.
  - In-session terminal history with `runId/status` filters and scoped rerun action (reuses same run scope + command envelope through guardrail checks).
  - Runtime response feedback includes execution status, exit code, output hash, and output preview when endpoint data is available.
  - Files:
    - `web/index.html`
    - `web/js/views/terminal.js`
    - `web/js/main.js`
    - `web/js/api.js`
    - `web/config/runtime-config.json`
    - `web/config/runtime-config.example.json`
- M14.3 evidence drill-in baseline:
  - Run detail includes `plan -> policy check -> execute -> verify` timeline rendering.
  - Desktop evidence summary table is rendered from `desktopObserveResponse`, `desktopActuateResponse`, and `desktopVerifyResponse`.
  - Expandable artifact panels provide request/policy/desktop/evidence payload drill-in.
  - File:
    - `web/js/views/runs.js`
- Approval-to-run evidence jump:
  - Approvals rows include `Open Run` action.
  - Action loads run detail directly and scrolls to evidence drill-in panel for fast triage.
  - Run detail includes `Open Related Approval` to jump back to scoped approval context.
  - Files:
    - `web/js/views/approvals.js`
    - `web/js/main.js`
- Workspace context bar:
  - Adds top-level project scope switching that syncs project filters across runs/approvals/audit/run-builder.
  - Shows active agent profile summary and live endpoint health badges for faster operator orientation.
  - Endpoint badges are clickable and jump directly to highlighted rows in the settings endpoint contract matrix.
  - Files:
    - `web/index.html`
    - `web/css/main.css`
    - `web/js/main.js`
- Ops triage deck:
  - Adds an `Ops Triage` panel with actionable counts for pending approvals, attention runs, audit denies, and terminal issues.
  - Provides one-click routing to scoped views (`Approvals`, `Runs`, `Audit`, `Terminal`) to reduce navigation friction during incident handling.
  - Files:
    - `web/index.html`
    - `web/css/main.css`
    - `web/js/main.js`
- Verifiers and daily loop:
  - `bin/verify-m14-ui-001.sh`
  - `bin/verify-m14-ui-002.sh`
  - `bin/verify-m14-ui-003.sh`
  - `bin/verify-m14-ui-004.sh`
  - `bin/verify-m14-ui-005.sh`
  - `bin/verify-m14-ui-006.sh`
  - `bin/verify-m14-ui-007.sh`
  - `bin/verify-m14-ui-008.sh`
  - `bin/verify-m14-ui-009.sh`
  - `bin/verify-m14-ui-010.sh`
  - `bin/verify-m14-ui-011.sh` (`RUN_M14_BROWSER_SMOKE=1` opt-in Safari WebDriver behavior smoke)
  - `bin/verify-m14-ui-012.sh`
  - `bin/verify-m14-ui-013.sh`
  - `bin/verify-m14-ui-014.sh`
  - `bin/verify-m14-ui-015.sh`
  - `bin/verify-m14-ui-016.sh`
  - `bin/verify-m14-ui-017.sh`
  - `bin/verify-m14-ui-018.sh`
  - `bin/verify-m14-ui-019.sh`
  - `bin/verify-m14-ui-020.sh`
  - `bin/verify-m14-ui-021.sh`
  - `bin/verify-m14-ui-022.sh`
  - `bin/verify-m14-ui-023.sh`
  - `bin/verify-m14-ui-024.sh`
  - `bin/verify-m14-ui-025.sh`
  - `bin/verify-m14-ui-026.sh` (macOS bootstrap/launcher availability)
  - `bin/verify-m14-ui-027.sh` (`RUN_M14_BROWSER_SWEEP=1` opt-in browser control sweep for knobs/buttons)
  - `bin/verify-m14-ui-028.sh` (`RUN_M14_BROWSER_STRESS=1` opt-in browser stress scenario for project/theme/action churn)
  - `bin/verify-m14-ui-029.sh` (`RUN_M14_AUTH_STRESS=1` opt-in auth/session robustness checks)
  - `bin/verify-m14-ui-daily-loop.sh`

## Local Run

1. `./bin/check-m1.sh`
2. `./bin/verify-m14-ui-daily-loop.sh`
3. `./bin/run-dev.sh`
4. Open `http://127.0.0.1:4173`
5. Optional browser smoke: `RUN_M14_BROWSER_SMOKE=1 ./bin/verify-m14-ui-011.sh`
6. Optional browser control sweep: `RUN_M14_BROWSER_SWEEP=1 ./bin/verify-m14-ui-027.sh`
7. Optional browser stress scenario: `RUN_M14_BROWSER_STRESS=1 ./bin/verify-m14-ui-028.sh`
8. Optional auth/session robustness: `RUN_M14_AUTH_STRESS=1 ./bin/verify-m14-ui-029.sh`

## macOS Program Path

- Bootstrap checks:
  - `./bin/bootstrap-macos-local.sh --mode mock`
  - `./bin/bootstrap-macos-local.sh --mode live`
- Launch:
  - mock mode (no runtime dependency): `./bin/run-macos-local.sh --mode mock`
  - live mode (port-forwards `epydios-system/orchestration-runtime`): `./bin/run-macos-local.sh --mode live`
- Optional install of double-click launcher:
  - `./bin/install-macos-launcher.sh`
  - installed path default: `~/Applications/Epydios AgentOps Desktop.command`
  - default launcher mode is `mock`; override per launch with `EPYDIOS_DESKTOP_MODE=live`

## Native App Track (No Browser)

- Framework choice is locked to `Wails` for M15 native packaging.
- Preflight prerequisites:
  - `./bin/check-m15-native-toolchain.sh`
- Current blocking prerequisites (on this host) are `node`, `npm`, and `wails`.

## Notes

- `mockMode=true` is default in `web/config/runtime-config.json` for local bring-up.
- For real control-plane calls, set `mockMode=false` and configure HTTPS endpoints and OIDC values in `web/config/runtime-config.json`.
- Default auth config now assumes `responseType=code` with `usePkce=true`.
- Browser smoke requires Safari Remote Automation enabled on the host (`Develop > Allow Remote Automation`).
