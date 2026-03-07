# Runtime Orchestration Service (Step 1)

This service moves policy/evidence/profile execution flow out of ad-hoc scripts and into a persistent API service.

## Binary

- `cmd/control-plane-runtime`

## Persistence

- Backed by Postgres table `orchestration_runs`
- Project-scoped integration settings persisted in Postgres table `orchestration_integration_settings`
- Automatically creates schema on startup

## Provider Selection

- Reads `ExtensionProvider` resources from the configured namespace
- Requires `status.conditions` `Ready=True` and `Probed=True`
- Applies `selection.enabled` and `selection.priority`
- Filters by required capability per stage:
  - `profile.resolve`
  - `policy.evaluate`
  - `evidence.record`
  - `observe.window_metadata` (DesktopProvider, when desktop execution is requested)

## API Endpoints

- `GET /healthz`
- `GET /metrics`
- `POST /v1alpha1/runtime/runs`
- `GET /v1alpha1/runtime/runs?limit=100&offset=0&status=...&policyDecision=...&tenantId=...&projectId=...&environment=...&providerId=...&retentionClass=...&search=...&createdAfter=...&createdBefore=...&includeExpired=true|false`
- `GET /v1alpha1/runtime/runs/export?format=jsonl|csv` (supports the same filters as list)
- `POST /v1alpha1/runtime/runs/retention/prune` (`dryRun`, `before`, `retentionClass`, `limit`)
- `GET /v1alpha1/runtime/runs/{runId}`
- `GET /v1alpha1/runtime/approvals?limit=100&tenantId=...&projectId=...&status=PENDING|APPROVED|DENIED|EXPIRED`
- `POST /v1alpha1/runtime/approvals/{runId}/decision` (`decision=APPROVE|DENY`, optional `reason`, optional `ttlSeconds`, optional `grantToken`)
- `GET /v1alpha1/runtime/audit/events?limit=100&tenantId=...&projectId=...&providerId=...&decision=...&event=...`
- `POST /v1alpha1/runtime/terminal/sessions` (run-scoped terminal command request with deterministic command allowlist, policy guardrails, and audit linkage)
- `GET /v1alpha1/runtime/integrations/settings?tenantId=...&projectId=...` (project-scoped integration settings read)
- `PUT /v1alpha1/runtime/integrations/settings` (`meta.tenantId`, `meta.projectId`, `settings` JSON object)
- `POST /v1alpha1/runtime/integrations/invoke` (`meta.tenantId`, `meta.projectId`, optional `agentProfileId`, `prompt`, optional `systemPrompt`, optional `maxOutputTokens`)
- `POST /v1alpha2/runtime/sessions/{sessionId}/tool-proposals/{proposalId}/decision` (`meta.tenantId`, `meta.projectId`, `decision=APPROVE|DENY`, optional `reason`)

## Integration Settings Contract (M14.9)

- Endpoint scope is tenant/project constrained and enforced through the same runtime authn/authz and scope rules as run endpoints.
- `settings` payload is normalized as a JSON object and stored by `(tenantId, projectId)`.
- Any key ending in `Ref` must use `ref://...` format.
- Raw secret-like values are blocked (`sk-*`, AWS key patterns, PEM headers, JWT-like fragments, and similar token patterns).
- Read and update actions emit runtime audit events:
  - `runtime.integrations.settings.read`
  - `runtime.integrations.settings.update`

## Integration Invoke Contract (2026-03-07)

- Endpoint scope is tenant/project constrained and enforced through the same runtime authn/authz and scope rules as run endpoints.
- The runtime loads the selected project-scoped integration settings, merges them with the default agent-profile catalog, and resolves the active profile before invocation.
- Supported profiles:
  - `codex`
  - `openai`
  - `anthropic`
  - `google`
  - `azure_openai`
  - `bedrock`
- Supported transports:
  - `responses_api`
  - `messages_api`
  - `gemini_api`
  - `chat_completions_api`
  - `bedrock_invoke_model`
- Route selection:
  - `gateway_first` uses the configured gateway refs first and optionally falls back to direct provider calls.
  - `direct_first` uses direct provider calls first, then gateway if still configured.
  - Gateway mTLS refs are optional; bearer-only gateway routing is allowed when token ref resolution succeeds.
- Reference resolution:
  - concrete endpoint and credential material is never accepted in the UI settings payload
  - runtime resolves `ref://...` values from either `RUNTIME_REF_VALUES_PATH` or `RUNTIME_REF_VALUES_JSON`
  - `RUNTIME_REF_VALUES_PATH` points to a JSON object mapping `ref://...` keys to resolved string or object values
  - `RUNTIME_REF_VALUES_JSON` accepts the same JSON object inline
- Direct endpoint defaults:
  - `codex` / `openai` default to `https://api.openai.com` when the configured endpoint ref is gateway-shaped
  - `anthropic` defaults to `https://api.anthropic.com`
  - `google` defaults to `https://generativelanguage.googleapis.com`
  - `azure_openai` and `bedrock` require explicit endpoint ref resolution
- Bedrock credential refs must resolve to a JSON object with:
  - `region`
  - either `accessKeyId` + `secretAccessKey`, or `source="env"` so runtime can read AWS env vars
- Response includes:
  - `source`
  - `route`
  - `provider`
  - `transport`
  - `model`
  - `endpointRef`
  - `credentialRef`
  - `outputText`
  - `finishReason`
  - `usage`
  - `rawResponse`
- Invoke request also supports:
  - `executionMode=raw_model_invoke|managed_codex_worker`
- Managed-worker response includes:
  - `sessionId`
  - `taskId`
  - `selectedWorkerId`
  - `executionMode`
  - `workerType`
  - `workerAdapterId`
- Invoke actions emit runtime audit events:
  - `runtime.integrations.invoke.started`
  - `runtime.integrations.invoke.failed`
  - `runtime.integrations.invoke.completed`

## Managed Codex Worker Bridge (M18)

- `executionMode=managed_codex_worker` keeps raw provider invocation distinct from managed worker execution.
- `managed_codex_worker` can now run in two modes:
  - `legacy`: existing provider-route-backed bridge path
  - `process`: direct local Codex CLI boundary
- `process` mode is configured with:
  - `RUNTIME_MANAGED_CODEX_MODE=process`
  - `RUNTIME_CODEX_CLI_PATH=/absolute/path/to/codex`
  - `RUNTIME_CODEX_WORKDIR=/absolute/path/to/workdir`
  - `RUNTIME_CODEX_SANDBOX_MODE=read-only|workspace-write|danger-full-access`
  - `RUNTIME_CODEX_EXEC_TIMEOUT=45s`
- In `process` mode, the runtime launches:
  - `codex exec --json --output-schema ...`
- The runtime captures:
  - structured operator-facing output text
  - structured governed `tool_proposals`
  - raw Codex JSONL transcript in `rawResponse`
  - worker output chunks as native `worker.output.delta` events
- Approved `terminal_command` proposals are promoted into governed tool actions and now move through:
  - `AUTHORIZED`
  - `STARTED`
  - `COMPLETED` or `FAILED`
- Proposal execution also records:
  - `tool_action.started`
  - `tool_action.completed` or `tool_action.failed`
  - `worker.progress`
  - `evidence.recorded` (`tool_output`) when command output exists

## Runtime Metrics (M12.1)

Runtime exposes SLO/SLI metrics at `/metrics`:

- `epydios_runtime_http_requests_total` (`method`, `path`, `status_class`, `status_code`)
- `epydios_runtime_http_request_duration_seconds` (`method`, `path`)
- `epydios_runtime_run_executions_total` (`outcome`, `decision`)
- `epydios_runtime_run_execution_duration_seconds` (`outcome`, `decision`)
- `epydios_runtime_provider_calls_total` (`provider_type`, `operation`, `outcome`)
- `epydios_runtime_provider_call_duration_seconds` (`provider_type`, `operation`, `outcome`)

## Runtime API Authn/Authz + Tenancy + Audit (M9.1/M9.2/M9.3/M9.4)

- Disabled by default (`AUTHN_ENABLED=false`)
- When enabled:
  - requires `Authorization: Bearer <jwt>` on runtime API endpoints (`/v1alpha1/runtime/*`)
  - enforces create/list/read permissions by role mapping
  - supports OIDC/JWKS (`RS256`) and local shared-secret mode (`HS256`)
- Environment/flags:
  - `AUTHN_ENABLED`, `AUTHN_ISSUER`, `AUTHN_AUDIENCE`
  - `AUTHN_JWKS_URL`, `AUTHN_JWKS_CACHE_TTL`, `AUTHN_HS256_SECRET`
  - `AUTHN_ROLE_CLAIM`, `AUTHN_CLIENT_ID_CLAIM`
  - `AUTHN_TENANT_CLAIM`, `AUTHN_PROJECT_CLAIM`
  - `AUTHZ_CREATE_ROLES`, `AUTHZ_READ_ROLES`, `AUTHZ_ALLOWED_CLIENT_IDS`
  - `AUTHZ_ROLE_PERMISSION_MAPPINGS_JSON` (OIDC role-to-permission translation matrix)
  - `AUTHZ_POLICY_MATRIX_JSON` (tenant/project allow/deny policy rules)
  - `AUTHZ_POLICY_MATRIX_REQUIRED` (require non-empty policy matrix when auth is enabled)
  - `AUTHZ_REQUIRE_POLICY_GRANT` (require policy grant token for non-`DENY` decisions before execution continues)
  - `AUTHZ_REQUIRE_AIMXS_ENTITLEMENT` (enable runtime entitlement checks for AIMXS policy-provider path)
  - `AUTHZ_AIMXS_PROVIDER_PREFIXES` (comma-separated provider name/providerId prefixes considered AIMXS)
  - `AUTHZ_AIMXS_ALLOWED_SKUS` (comma-separated allowed SKUs; optional)
  - `AUTHZ_AIMXS_REQUIRED_FEATURES` (comma-separated required feature flags; optional)
  - `AUTHZ_AIMXS_SKU_FEATURES_JSON` (JSON map: `sku -> required feature list`)
  - `AUTHZ_AIMXS_ENTITLEMENT_TOKEN_REQUIRED` (require entitlement token on AIMXS path; defaults true)
  - `POLICY_LIFECYCLE_ENABLED` (enable lifecycle checks on policy bundle metadata)
  - `POLICY_LIFECYCLE_MODE` (`observe` or `enforce`)
  - `POLICY_ALLOWED_IDS` (comma-separated allowed policy bundle IDs)
  - `POLICY_MIN_VERSION` (minimum accepted policy bundle version)
  - `POLICY_ROLLOUT_PERCENT` (stable rollout bucket allowlist, `0-100`)
  - `DESKTOP_MIN_PRIORITY` (minimum provider priority for `DesktopProvider` selection)
  - `DESKTOP_ALLOW_NON_LINUX` (defaults `false`; keeps runtime Linux-first for desktop execution path)
  - `RETENTION_DEFAULT_CLASS` (default class when request omits `retentionClass`)
  - `RETENTION_POLICY_JSON` (JSON map of `retentionClass -> duration`, for example `{"short":"24h","standard":"168h","archive":"720h"}`)
- Scope enforcement:
  - create/read/list paths enforce tenant/project scope from JWT claims when scope claims are present
  - cross-tenant and cross-project access is denied
- RBAC policy matrix (M9.4):
  - role mappings translate IdP/OIDC roles to runtime permissions
  - policy rules apply allow/deny precedence with tenant/project selectors
  - deny rules override allow rules; missing allow rule denies access
- Structured audit:
  - emits JSON audit events to runtime logs for authn/authz decisions, policy matrix allow/deny, provider selection, policy decisions, and run outcome
  - exposes recent in-memory audit events via `GET /v1alpha1/runtime/audit/events` for operator UI reads (scoped by authz + tenant/project rules)
- Error mapping:
  - missing/invalid token -> `401 UNAUTHORIZED`
  - permission/client-id denial -> `403 FORBIDDEN`

## Policy Lifecycle Controls (M9.6)

- Runtime captures policy bundle metadata (`policyBundleId`, `policyBundleVersion`) from policy responses.
- Lifecycle policy can enforce:
  - approved policy IDs (`POLICY_ALLOWED_IDS`)
  - minimum version floor (`POLICY_MIN_VERSION`)
  - rollout window (`POLICY_ROLLOUT_PERCENT`)
- Modes:
  - `observe`: emit lifecycle violation audit events and continue execution
  - `enforce`: block run execution when lifecycle checks fail

## Retention Controls (M9.6)

- Runtime records `retentionClass` and computes `expiresAt` from `RETENTION_POLICY_JSON`.
- Unknown retention classes are rejected when retention policy map is configured.
- Operators can run prune checks (or deletion) via:
  - `POST /v1alpha1/runtime/runs/retention/prune`
  - `dryRun=true` returns candidate run IDs/count without deleting.

## Policy Grant Enforcement (AIMXS-Compatible)

- Optional strict mode (`AUTHZ_REQUIRE_POLICY_GRANT=true`) blocks execution when policy decision is non-`DENY` and no grant token is returned.
- Supported grant token fields from policy response:
  - `grantToken`
  - `grant_token`
  - `capabilityGrant`
  - `capability_grant`
  - `output.grantToken` / `output.grant_token` / `output.aimxsGrantToken`
- Runtime stores only:
  - `policyGrantTokenPresent`
  - `policyGrantTokenSha256`
- Raw grant token values are redacted from persisted `policyResponse` payloads.

## AIMXS Entitlement Enforcement (M10.6)

- Optional strict mode (`AUTHZ_REQUIRE_AIMXS_ENTITLEMENT=true`) applies only to policy providers whose name/providerId matches `AUTHZ_AIMXS_PROVIDER_PREFIXES`.
- Runtime reads entitlement inputs from `request.annotations` (`aimxsEntitlement.sku`, `aimxsEntitlement.token`, `aimxsEntitlement.features`, plus flat-key compatibility aliases).
- Runtime performs deny-first checks before policy provider call:
  - token required (when enabled)
  - SKU allowlist (`AUTHZ_AIMXS_ALLOWED_SKUS`)
  - required feature flags (`AUTHZ_AIMXS_REQUIRED_FEATURES` + `AUTHZ_AIMXS_SKU_FEATURES_JSON`)
- On entitlement failure, runtime emits a synthetic `DENY` policy result with explicit reason codes:
  - `AIMXS_ENTITLEMENT_TOKEN_REQUIRED`
  - `AIMXS_ENTITLEMENT_SKU_REQUIRED`
  - `AIMXS_ENTITLEMENT_SKU_NOT_ALLOWED`
  - `AIMXS_ENTITLEMENT_FEATURE_MISSING`
- Audit events:
  - `runtime.aimxs.entitlement.evaluate`
  - `runtime.aimxs.entitlement.allow`
  - `runtime.aimxs.entitlement.deny`

## Execution Flow

1. Resolve profile
2. Evaluate policy
3. Optional desktop execution step loop (`observe -> actuate -> verify`) when `desktop` request block is present and policy decision is `ALLOW`
   - For Tier 3 requests that need explicit operator decision, approval queue metadata is exposed via `/v1alpha1/runtime/approvals` and operator decision is recorded via `/v1alpha1/runtime/approvals/{runId}/decision`
4. Record evidence
5. Finalize evidence bundle
6. Persist stage transitions and outputs in Postgres

## Desktop Execution Plane (M13.2 baseline)

- Runtime executes desktop steps only when request includes a `desktop` block.
- Tier behavior:
  - Tier 1 (`desktop.tier=1`): desktop path is skipped (`Tier 1 connectors/API-first`).
  - Tier 2 (`desktop.tier=2`, default): governed desktop `observe -> actuate -> verify` is allowed.
  - Tier 3 (`desktop.tier>=3`): requires both `desktop.humanApprovalGranted=true` and policy grant token.
- Linux-first restrictions:
  - `desktop.targetOS` defaults to `linux`.
  - Non-Linux targets are blocked unless `DESKTOP_ALLOW_NON_LINUX=true`.
- Autonomy profile defaults:
  - `desktop.targetExecutionProfile` defaults to `sandbox_vm_autonomous`.
  - `restricted_host` requires explicit `desktop.restrictedHostOptIn=true`.
- Evidence + audit:
  - Desktop responses are persisted in run record fields:
    - `selectedDesktopProvider`
    - `desktopObserveResponse`
    - `desktopActuateResponse`
    - `desktopVerifyResponse`
  - Evidence record payload includes a `desktop` section with step, decisions, and verifier outputs.

## Kubernetes Manifests

- `platform/system/controllers/orchestration-runtime/*`

## Local Verification Gate

- `platform/local/bin/verify-m5-runtime-orchestration.sh`
  - optional bootstrap (`RUN_BOOTSTRAP=1`) to ensure CNPG/Postgres substrate
  - optional image build/load (`RUN_IMAGE_PREP=1`)
  - validates `create/list/get` runtime APIs with both ALLOW and DENY flows
- `platform/local/bin/verify-m9-authn-authz.sh`
  - optional baseline bootstrap via M5 verifier
  - enables runtime authn/authz in-cluster
  - validates `401`, `403`, and role/client-id enforcement paths
- `platform/local/bin/verify-m9-authz-tenancy.sh`
  - optional baseline bootstrap via M5 verifier
  - validates tenant/project scope isolation and cross-tenant denial paths
  - validates runtime audit event emission for authz, provider selection, policy decision, and run completion
- `platform/local/bin/verify-m9-rbac-matrix.sh`
  - optional baseline bootstrap via M5 verifier
  - validates OIDC role mapping and tenant/project allow/deny policy matrix behavior
  - validates explicit deny-rule precedence and implicit no-allow denial paths
- `platform/local/bin/verify-m9-audit-read.sh`
  - optional baseline bootstrap via M5 verifier
  - validates authenticated `GET /v1alpha1/runtime/audit/events` reads
  - validates tenant/project scoped filtering and provider/decision/event query filters
  - validates invalid query handling (`INVALID_LIMIT`)
- `platform/local/bin/verify-m9-policy-lifecycle-and-run-query.sh`
  - optional baseline bootstrap via M5 verifier
  - validates policy lifecycle enforcement (`observe|enforce`)
  - validates run list filter/search semantics
  - validates CSV/JSONL export
  - validates retention prune dry-run behavior
- `platform/local/bin/verify-m10-policy-grant-enforcement.sh`
  - optional baseline bootstrap via M5 verifier
  - validates non-bypassable grant enforcement (`no token => no execution`) for non-`DENY` policy decisions
- `platform/local/bin/verify-m10-entitlement-deny.sh`
  - optional baseline bootstrap via M5 verifier
  - validates AIMXS entitlement deny paths (missing token, bad SKU, missing feature) and licensed ALLOW path
- `platform/local/bin/verify-m13-openfang-runtime-integration.sh`
  - validates runtime fixture integration and adapter path (`observe -> actuate -> verify` + `restricted_host` deny)
- `platform/local/bin/verify-m13-runtime-approvals.sh`
  - validates runtime approval queue/decision API contract (`GET /runtime/approvals`, `POST /runtime/approvals/{runId}/decision`, including expired-request rejection)
  - validates tier-3 approval status model transitions (`PENDING|APPROVED|DENIED|EXPIRED`)
- `platform/local/bin/verify-m14-runtime-terminal-integration.sh`
  - validates runtime terminal endpoint contract (`POST /runtime/terminal/sessions`) including allowlisted command execution and forced `restricted_host` deny-path behavior
- `platform/local/bin/verify-m14-runtime-integration-settings.sh`
  - validates runtime integration settings contract (`GET/PUT /runtime/integrations/settings`) including scope/authz checks and `ref://` / raw-secret deny paths
- `platform/local/bin/verify-m14-win-restricted-readiness.sh`
  - validates `V-M14-WIN-001` restricted-profile readiness assertions (`windows` template disabled-by-default + non-linux default block + linux-adapter deny path)
- `platform/local/bin/verify-m14-mac-restricted-readiness.sh`
  - validates `V-M14-MAC-001` restricted-profile readiness assertions (`macos` template disabled-by-default + non-linux default block + linux-adapter deny path)
- `platform/local/bin/verify-m14-xos-parity.sh`
  - validates `V-M14-XOS-001` cross-OS parity assertions and writes machine-readable M14.7 closeout evidence bundle
