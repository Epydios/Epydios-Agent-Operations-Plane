# Epydios AgentOps Desktop

`Epydios AgentOps Desktop` is the separate operator UI module for the Epydios control plane.

This module is intentionally outside `EPYDIOS_AI_CONTROL_PLANE` to keep backend/runtime release velocity independent from UI release cadence.

## Module Boundary (non-negotiable)

- UI consumes control-plane APIs over HTTPS (Gateway/Ingress).
- UI does not import control-plane backend code directly.
- UI does not connect directly to Postgres/CNPG.
- Auth uses the same OIDC/JWT issuer and audience model as runtime API.
- AIMXS remains external and is surfaced through provider status/events, not linked into UI code.
- On the local Mac operator path, AIMXS activation is handled by the launcher helper in `bin/run-macos-local.sh`, which applies repo manifests and updates cluster secrets over the existing `ExtensionProvider` boundary instead of embedding AIMXS logic into the runtime or UI build graph.

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
  - `web/js/main.js`
- Locked default behavior for non-blocking runtime choices:
  - Realtime transport: `polling` (`5000ms`) with `sse` option reserved.
  - Terminal mode: `interactive_sandbox_only`, with `restricted_host` blocked by default.
  - Integration routing: `gateway_first` (`litellm`) with optional direct-provider fallback.
- Runtime-visible decision surface:
  - The explicit `Execution Defaults` panel has since been removed from `Home`; the underlying defaults still drive `Settings` and `Developer` workflows.

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
  - Agent Invocation Test panel wired to `POST /v1alpha1/runtime/integrations/invoke` for live profile validation across `codex`, `openai`, `anthropic`, `google`, `azure_openai`, and `bedrock`.
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

## Live Browser Diagnostics (M21)

- `mock` mode does not hit real model providers; it returns synthetic runtime data.
- `live` mode proxies browser requests through the local launcher. By default that launcher still uses `kubectl port-forward` to `epydios-system/orchestration-runtime`.
- If the cluster runtime image is older than the repo contract, the browser can still load but Settings or Chat will show partial live warnings. The local diagnostics path is:
  1. `curl -s http://127.0.0.1:4173/config/runtime-config.json | jq '{mockMode,environment,runtimeApiBaseUrl,registryApiBaseUrl}'`
  2. `curl -i http://127.0.0.1:8080/healthz`
  3. `curl -i http://127.0.0.1:8080/v1alpha1/runtime/runs?limit=1`
  4. `curl -i http://127.0.0.1:8080/v1alpha1/runtime/approvals?limit=1`
  5. `curl -i "http://127.0.0.1:8080/v1alpha1/runtime/integrations/settings?tenantId=tenant-demo&projectId=project-core"`
  6. `curl -i http://127.0.0.1:8080/v1alpha1/providers`
- If those contract checks fail, switch to the repo-local runtime path below instead of continuing to debug the browser UI against an older cluster image.

## OpenAI Live Test Path (Recommended)

- Runtime ref resolution sources:
  - `RUNTIME_REF_VALUES_PATH=/absolute/path/to/ref-values.json`
  - `RUNTIME_REF_VALUES_JSON='{"ref://...":"..."}'`
- Local secure store from `Settings -> Configuration -> Secure Local Credential Capture`
- The project settings editor remains reference-only. Concrete values stay outside the settings draft and are resolved by the local runtime from the explicit ref-values input plus the local secure store.
- The same local secure store is also used by `Settings -> Configuration -> AIMXS Deployment Contract` when you run `Activate AIMXS Mode` on the live launcher path.
- A non-repo template for the ref-values JSON is kept under `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/integration-invoke/`.
- The local secure store uses macOS Keychain plus a non-repo ref index at `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/local-ref-vault/index.json`.
- The local runtime launcher merges secure-store refs after the explicit file or JSON input, so secure-store entries override duplicates on the next terminal-1 restart.
- AIMXS activation on the live launcher path resolves stored AIMXS refs when the selected contract needs them, creates or updates `aimxs-policy-token`, `epydios-controller-mtls-client`, and `epydios-provider-ca` secrets for `aimxs-https`, and uses the local AIMXS provider shim for `aimxs-full`.

Recommended operator path:
1. Optional but recommended: start `./bin/run-macos-local.sh --mode mock`, open `Settings -> Configuration -> Secure Local Credential Capture`, and save the concrete local values for the refs you plan to use.
2. Start the repo runtime locally on macOS:
   - `./bin/run-local-runtime-macos.sh`
   - or keep using an explicit seed file: `./bin/run-local-runtime-macos.sh --ref-values-path "/absolute/path/to/ref-values.json"`
3. In a second terminal, run the browser UI against that local runtime:
   - `./bin/run-macos-local.sh --mode live --runtime-base-url "http://127.0.0.1:18080"`
4. Open `Settings -> Configuration`.
5. Confirm the `Secure Local Credential Capture` panel shows the expected stored refs and paths.
6. Set `modelRouting=direct_first` if no LiteLLM gateway is available.
7. Use `Agent Invocation Test` with a low-risk prompt such as `Reply with exactly: agentops-live-ok`.
8. If you are testing AIMXS, save the AIMXS endpoint/token/client-TLS/provider-CA refs in `Secure Local Credential Capture`, choose the desired deployment mode under `AIMXS Deployment Contract`, then run `Activate AIMXS Mode` and confirm the activation summary shows the expected cluster mode and provider capabilities.
   - `Apply AIMXS Settings` saves the Desktop contract draft only.
   - `Activate AIMXS Mode` switches the live desktop/runtime policy-provider path on the local launcher path.
   - `aimxs-full` is the preferred local troubleshooting mode. It uses the live launcher AIMXS provider shim and does not require HTTPS or secure ref material.
9. To prove the baseline-vs-AIMXS decision difference on the current local stack, run `./bin/verify-m21-aimxs-richness.sh`.
   - The script compares provider capabilities directly, submits the same high-risk external-actuator probe to both providers, expects `aimxs-full` to `DEFER` with AIMXS evidence metadata, expects the baseline provider to return baseline OPA output without `DEFER`, and runs the AIMXS-only handshake sample against the extracted pack adapter seam.
   - Preconditions: terminal 2 is running so `aimxs-full` is live on `http://127.0.0.1:4271`, and the cluster is reachable so the script can port-forward `svc/epydios-oss-policy-provider`.
   - `aimxs-https` is the secure external-provider path and requires the full endpoint, bearer-token, controller-client-TLS, and provider-CA ref set.
10. For a manual provider-level side-by-side between `baseline` and `aimxs-full`, use [aimxs-oss-manual-side-by-side.md](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/docs/runbooks/aimxs-oss-manual-side-by-side.md).
   - Use this when you want the lowest-level provider comparison.
   - It intentionally omits `aimxs-https`.
11. For the real recordable product demo path, use [aimxs-governed-action-demo.md](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/docs/runbooks/aimxs-governed-action-demo.md).
   - This path stays inside the actual product after startup.
   - It uses `Developer -> Governed Action Request`, then reviews the real stored result in `History -> 2. Policy Richness`.
   - It is the current source of truth for a recordable `baseline` versus `aimxs-full` operator demo.

Direct defaults exist for:
- `codex` / `openai` -> `https://api.openai.com`
- `anthropic` -> `https://api.anthropic.com`
- `google` -> `https://generativelanguage.googleapis.com`

Explicit endpoint refs are still required for:
- `azure_openai`
- `bedrock`

## Managed Codex Worker Testing

- `Execution Path = Raw Model Invoke` keeps the request on the provider API path.
- `Execution Path = Managed Codex Worker` uses the native M16 session or worker contract and managed worker review surfaces in `Chat`.
- The supported macOS operator path is to run the repo runtime locally on the same host as the Codex.app bundle, then point browser live mode at that runtime.
- Default local Codex process settings in the local runtime launcher are:
  - `RUNTIME_MANAGED_CODEX_MODE=process`
  - `RUNTIME_CODEX_CLI_PATH=/Applications/Codex.app/Contents/Resources/codex`
  - `RUNTIME_CODEX_WORKDIR=<repo root unless overridden>`
  - `RUNTIME_CODEX_SANDBOX_MODE=workspace-write`
  - `RUNTIME_CODEX_EXEC_TIMEOUT=45s`
- In `process` mode, AgentOps launches Codex against an AgentOps-owned gateway boundary instead of letting the local Codex process choose a provider path itself. The managed turn review shows that boundary back as `route`, `boundary`, and `endpointRef`.

Minimal operator path:
1. Start the local runtime on macOS:
   - `./bin/run-local-runtime-macos.sh --codex-workdir "/absolute/path/to/workdir"`
   - or seed from an explicit file and let the local secure store override duplicates on restart: `./bin/run-local-runtime-macos.sh --ref-values-path "/absolute/path/to/ref-values.json" --codex-workdir "/absolute/path/to/workdir"`
   - for local Mac testing, if the ref-values file includes only the normal OpenAI API key refs, the launcher now synthesizes:
     - `ref://gateways/litellm/openai-compatible`
     - `ref://gateways/litellm/openai`
     - `ref://projects/{projectId}/gateways/litellm/bearer-token`
     so managed Codex `process` mode can use the same local key without requiring a separate LiteLLM setup first
   - secure local refs saved from Settings are loaded from macOS Keychain plus the non-repo ref index at `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/local-ref-vault/index.json`
   - the launcher also bootstraps an isolated per-session `CODEX_HOME` under the non-repo session directory and runs `codex login --with-api-key` against that home, so local managed Codex testing uses API-key auth instead of inheriting the operator's desktop Codex ChatGPT session
2. Start the browser UI against that runtime:
   - `./bin/run-macos-local.sh --mode live --runtime-base-url "http://127.0.0.1:18080"`
3. Open `Chat`.
4. Set `Execution Path` to `Managed Codex Worker`.
5. Start a thread and submit a turn.
6. Review structured tool proposals in chat.
7. Approve or deny proposals directly in chat.
8. After approval, confirm the same native session continues instead of creating a detached follow-up path.
9. Review resulting tool-action status changes (`AUTHORIZED`, `STARTED`, `COMPLETED`, or `FAILED`), managed worker transcript, evidence, and worker progress in the same thread.

Policy boundary note:
- current process mode governs operator turns, Codex-generated tool proposals, governed tool execution, the resumed worker session, and Codex -> model-provider traffic on one M16 timeline through the AgentOps gateway boundary
- the review surfaces expose the mediated boundary explicitly so operator chat can show which gateway path controlled the turn

## macOS Program Path

- Bootstrap checks:
  - `./bin/bootstrap-macos-local.sh --mode mock`
  - `./bin/bootstrap-macos-local.sh --mode live`
- Launch:
  - mock mode (no runtime dependency): `./bin/run-macos-local.sh --mode mock`
  - cluster live mode (port-forwards `epydios-system/orchestration-runtime`): `./bin/run-macos-local.sh --mode live`
  - local runtime live mode (recommended for full repo contract): `./bin/run-macos-local.sh --mode live --runtime-base-url "http://127.0.0.1:18080"`
- Local runtime:
  - `./bin/run-local-runtime-macos.sh`
  - this script port-forwards Postgres from the active cluster, runs `cmd/control-plane-runtime` locally, and writes logs/caches outside the repo
- Optional install of double-click launcher:
  - `./bin/install-macos-launcher.sh`
  - installed path default: `~/Applications/Epydios AgentOps Desktop.command`
  - default launcher mode is `mock`; override per launch with `EPYDIOS_DESKTOP_MODE=live`
- Local browser-run artifacts now live under the non-repo cache root:
  - `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m21-local-cache/macos-launch/<timestamp>`
- Legacy repo-local browser cache cleanup:
  - dry run: `./bin/cleanup-macos-local-cache.sh --dry-run`
  - remove legacy repo-local build cache only: `./bin/cleanup-macos-local-cache.sh`
  - remove legacy repo-local browser sessions too: `./bin/cleanup-macos-local-cache.sh --include-launch-sessions`

## Native App Track (No Browser)

- Framework choice is locked to `Wails` for M15 native packaging.
- Preflight prerequisites:
  - `./bin/check-m15-native-toolchain.sh`
- The preflight also checks common user-local install locations such as `~/bin` and `~/.local/bin`.
- If the preflight fails, install the missing host prerequisites and rerun it until PASS.
- Phase A native shell foundation:
  - runner: `./bin/run-m15-native-macos.sh --mode mock`
  - verifier: `./bin/verify-m15-phase-a.sh`
  - script-managed cache root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-cache/`
  - cached native binary root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-cache/native-build/<host-tag>/`
  - staged frontend root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-cache/frontend-stage/phase-a/`
  - session output root: `${XDG_CACHE_HOME:-$HOME/Library/Caches}/EpydiosAgentOpsDesktop/native-shell/<timestamp>`
  - session manifest includes runtime mode, runtime process mode, log paths, crash-dump path, and the default `sandbox_vm_autonomous` / restricted-host-blocked posture
- The Wails shell stages the existing `web/` bundle into a per-session directory and rewrites `config/runtime-config.json` there, so native mock/live launches preserve the current browser-era config flow.
- Phase B Linux packaging baseline:
  - packager: `./bin/package-m15-linux.sh`
  - verifier: `./bin/verify-m15-phase-b.sh`
  - Docker Linux host wrapper (from macOS): `./bin/run-m15-phase-b-linux-docker.sh`
  - artifact root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-native-phase-b/<timestamp>`
  - on non-Linux hosts the Phase B verifier records the packaging blocker instead of pretending Linux artifacts were produced
- Phase B Linux exit gate proof:
  - verifier: `./bin/verify-m15-phase-b-exit-gate.sh`
  - Docker wrapper (from macOS): `./bin/run-m15-phase-b-exit-gate-docker.sh`
  - proof root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-native-phase-b-exit/<timestamp>`
  - default mode is `live`; `mock` is only a troubleshooting fallback and does not close the Phase B exit gate
- Phase C macOS packaged beta:
  - packager: `./bin/package-m15-macos.sh`
  - installer: `./bin/install-m15-macos-beta.sh`
  - launcher: `./bin/launch-m15-macos-beta.sh`
  - uninstaller: `./bin/uninstall-m15-macos-beta.sh`
  - verifier: `./bin/verify-m15-phase-c.sh`
  - proof root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-native-phase-c/<timestamp>`
  - package flow uses a deterministic manual `.app` bundle around the working native binary so Phase C does not depend on the opaque Wails packaging wrapper
  - bootstrap config default path for installed beta runs: `$HOME/Library/Application Support/EpydiosAgentOpsDesktop/runtime-bootstrap.json`
  - local beta install root default: `$HOME/Applications/Epydios AgentOps Desktop.app`
- Phase D Windows parity foundation:
  - packager: `./bin/package-m15-windows.sh`
  - Docker Linux builder wrapper (from macOS): `./bin/run-m15-phase-d-windows-docker.sh`
  - verifier: `./bin/verify-m15-phase-d.sh`
  - Docker builder definition: `./docker/m15-windows-builder/Dockerfile`
  - proof root: `../../../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-native-phase-d/<timestamp>`
  - current proof covers Windows `.exe` + NSIS installer baseline plus the existing Windows parity verifier foundation
  - Phase D exit gate still requires real packaged-app execution proof on a Windows host before the milestone can close

## Notes

- `mockMode=true` is default in `web/config/runtime-config.json` for local bring-up.
- For real control-plane calls, set `mockMode=false` and configure HTTPS endpoints and OIDC values in `web/config/runtime-config.json`.
- Default auth config now assumes `responseType=code` with `usePkce=true`.
- Browser smoke requires Safari Remote Automation enabled on the host (`Develop > Allow Remote Automation`).
