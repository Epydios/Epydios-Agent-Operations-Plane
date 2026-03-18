# AIMXS Desktop Touchpoints

This folder owns Desktop-specific AIMXS logic that should remain easy to find and remove.

## Module-owned files

- `state.js`
- `editor.js`
- `settings-view.js`

## Current Desktop contract shape

- Deployment modes owned by this module:
  - `oss-only`
  - `aimxs-https`
  - `aimxs-full` for local troubleshooting on the live launcher/runtime AIMXS shim
- Secure ref fields owned by this module:
  - `endpointRef`
  - `bearerTokenRef`
  - `clientTlsCertRef`
  - `clientTlsKeyRef`
  - `caCertRef`
- Legacy mode aliases are intentionally not supported here. Unsupported old mode values fall back to `oss-only`.
- Ref field fallbacks still accepted here:
  - `mtlsCertRef`
  - `mtlsKeyRef`
  - `caBundleRef`

## Remaining cross-cutting touchpoints

- `ui/desktop-ui/web/js/main.js`
  Lifecycle wiring, local storage integration, refresh flow, and Settings event handlers.
- `ui/desktop-ui/web/js/views/settings.js`
  Imports AIMXS-specific rendering into the Settings surface.
- `ui/desktop-ui/web/js/api.js`
  Imports AIMXS provider-status summarization into the Settings snapshot payload.
- `ui/desktop-ui/web/js/runtime/choices.js`
  Imports AIMXS normalization into runtime-choice resolution.
- `ui/desktop-ui/web/js/config.js`
  Imports AIMXS default refs into Desktop config defaults.
- `ui/desktop-ui/bin/run-macos-local.sh`
  Hosts the AIMXS activation helper that resolves local secure refs, applies `aimxs-https` provider-mode manifests, and switches `aimxs-full` onto the local AIMXS shim on the local operator path.

## Boundary files that should not be moved into this folder

- `docs/aimxs-plugin-slot.md`
- `internal/providerboundary/slot.go`
- `platform/modes/README.md`
- `platform/modes/aimxs-https/*`
- `platform/modes/aimxs-full/*`
- `examples/providers/aimxs-boundary/*`

These stay in their existing locations because they define the external slot contract and deployment-mode boundary, not Desktop-only logic.

## Removal order

If AIMXS Desktop support needs to be removed later, remove this folder first, then remove the imports listed under remaining cross-cutting touchpoints, and leave the boundary files in place unless the underlying provider contract itself is being deleted.
