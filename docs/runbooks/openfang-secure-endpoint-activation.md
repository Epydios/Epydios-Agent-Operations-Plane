# Openfang Secure Endpoint Activation Runbook (M13/M14)

## Purpose

Enable the Openfang DesktopProvider path safely, keeping sandbox autonomy as default and host autonomy restricted by policy.

## Scope

- Applies to Openfang provider registration scaffolds:
  - `platform/providers/oss-desktop-openfang/extensionprovider.yaml`
  - `platform/providers/oss-desktop-openfang/extensionprovider-windows-restricted.yaml`
  - `platform/providers/oss-desktop-openfang/extensionprovider-macos-restricted.yaml`
  - `examples/providers/extensionprovider-oss-desktop-openfang-mtls-bearer.yaml`
- Does not authorize broad host-autonomous execution.

## Required Secrets and References

Create these in `epydios-system` before secure activation:

1. Bearer token secret
- Name: `openfang-desktop-provider-auth`
- Required key: `token`

2. mTLS client cert secret
- Name: `epydios-control-plane-client-tls`
- Required keys: `tls.crt`, `tls.key`

3. Provider CA bundle secret
- Name: `openfang-desktop-provider-ca`
- Required key: `ca.crt` (or `tls.crt` if CA bundle is stored there)

4. Windows endpoint server TLS secret
- Name: `openfang-provider-windows-server-tls`
- Required keys: `tls.crt`, `tls.key`

5. macOS endpoint server TLS secret
- Name: `openfang-provider-macos-server-tls`
- Required keys: `tls.crt`, `tls.key`

The secure registration manifest references these through:
- `auth.mode: MTLSAndBearerTokenSecret`
- `auth.bearerTokenSecretRef`
- `auth.clientTLSSecretRef`
- `auth.caSecretRef`

## Activation Sequence

1. Keep selection disabled while validating auth and endpoint health:
- `spec.selection.enabled: false`

2. Apply secure registration template:

```bash
kubectl apply -f examples/providers/extensionprovider-oss-desktop-openfang-mtls-bearer.yaml
```

3. Apply restricted xOS secure endpoint workloads (keeps provider routing disabled while probe readiness is established):

```bash
kubectl apply -k platform/providers/oss-desktop-openfang/xos-secure
```

4. Verify endpoint readiness and contract surface (without routing live runtime traffic):

```bash
./platform/local/bin/verify-m13-openfang-adapter.sh
./platform/local/bin/verify-m13-openfang-runtime-integration.sh
./platform/local/bin/verify-m13-runtime-approvals.sh
./platform/local/bin/verify-m13-openfang-sandbox-rehearsal.sh
./platform/local/bin/verify-m13-desktop-provider.sh
./platform/local/bin/verify-m13-desktop-runtime.sh
./platform/local/bin/verify-m14-openfang-xos-adapters.sh
./platform/local/bin/verify-m14-openfang-enablement-gate.sh
./platform/ci/bin/qc-preflight.sh
```

Sandbox rehearsal prerequisite:
- local kind/k3d context CRD must support `providerType: DesktopProvider` for `ExtensionProvider`.

5. Capture required evidence artifacts in non-GitHub provenance:
- `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/openfang/m13-openfang-adapter-<timestamp>.log`
- `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/openfang/m13-openfang-runtime-integration-<timestamp>.log`
- `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/openfang/m13-runtime-approvals-<timestamp>.log`
- `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/openfang/m13-openfang-sandbox-rehearsal-<timestamp>.log`
- `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/openfang/m13-openfang-daily-loop-<timestamp>.log`

6. Enable provider routing only after gate criteria pass:

```bash
kubectl -n epydios-system patch extensionprovider oss-desktop-openfang-linux-secure \
  --type=merge \
  -p '{"spec":{"selection":{"enabled":true,"priority":70}}}'
```

7. Keep restricted-host posture blocked by default in adapter config:
- `allowRestrictedHost: false`

## Enablement Gate Criteria (Scaffold -> Active)

All criteria are required:

1. Guardrail verifiers pass
- `verify-m13-openfang-adapter.sh` PASS
- `verify-m13-openfang-runtime-integration.sh` PASS
- `verify-m13-runtime-approvals.sh` PASS
- `verify-m13-openfang-sandbox-rehearsal.sh` PASS (or explicit CRD compatibility blocker documented)
- `verify-m13-desktop-provider.sh` PASS
- `verify-m13-desktop-runtime.sh` PASS
- `verify-m14-openfang-xos-adapters.sh` PASS
- `verify-m14-openfang-enablement-gate.sh` PASS

2. Runtime integration behavior proven
- sandbox profile path completes `observe -> actuate -> verify`
- restricted-host path returns `restricted_host_blocked` deny

3. Secure endpoint posture validated
- provider auth mode is `MTLSAndBearerTokenSecret`
- required secrets are present and readable by runtime namespace
- xOS endpoint server TLS secrets are present (`openfang-provider-windows-server-tls`, `openfang-provider-macos-server-tls`)
- xOS endpoint workloads are deployed (`openfang-provider-windows`, `openfang-provider-macos`)
- endpoint health + capabilities checks succeed under configured auth path

4. Evidence package archived in non-GitHub provenance
- logs and summary for all checks are stored under `..._NON_GITHUB/provenance/openfang/`
- evidence includes command lines, timestamps, and pass/fail outcomes

5. Policy posture unchanged
- `sandbox_vm_autonomous` remains default autonomous profile
- `restricted_host` remains denied unless a future explicit policy decision changes this

6. Cross-OS activation posture unchanged until explicit approval
- Windows/macOS manifests remain `selection.enabled=false`
- Any future enablement flip must be per-OS, with explicit approval and fresh verifier evidence

## Rollback

If any post-enable validation fails, disable selection immediately:

```bash
kubectl -n epydios-system patch extensionprovider oss-desktop-openfang-linux-secure \
  --type=merge \
  -p '{"spec":{"selection":{"enabled":false}}}'
```

Then rerun the M13 Openfang verifier loop and re-collect evidence.
