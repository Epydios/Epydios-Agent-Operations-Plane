# ExtensionProvider Examples

These examples show the public provider boundary used by the OSS control plane.
Keep the split simple:

- OSS examples live directly in this folder.
- AIMXS boundary examples live in `aimxs-boundary/`.

## OSS Examples

- `extensionprovider-oss-policy.yaml` baseline OSS policy provider
- `extensionprovider-oss-evidence.yaml` baseline OSS evidence provider
- `extensionprovider-oss-profile.yaml` baseline static profile resolver
- `extensionprovider-oss-desktop-linux.yaml` Linux-first desktop execution provider (observe/actuate/verify)
- `extensionprovider-oss-desktop-openfang-linux.yaml` Linux-first Openfang adapter registration (disabled by default until upstream endpoint is configured)
- `extensionprovider-oss-desktop-openfang-mtls-bearer.yaml` Openfang secure endpoint template (`MTLSAndBearerTokenSecret`, sandbox-first, disabled by default)
- `extensionprovider-oss-desktop-openfang-windows-restricted.yaml` Windows restricted-readiness template (`selection.enabled=false`, restricted profile annotations)
- `extensionprovider-oss-desktop-openfang-macos-restricted.yaml` macOS restricted-readiness template (`selection.enabled=false`, restricted profile annotations)

## AIMXS Boundary Examples

- `aimxs-boundary/extensionprovider-policy-https.yaml` public AIMXS HTTPS registration template
- `aimxs-boundary/extensionprovider-aimxs-policy.yaml` AIMXS policy-provider registration example for private deployment repos

## Notes

- These are examples, not production manifests.
- Endpoint URLs, secrets, and certificates should be environment-specific.
- AIMXS images and endpoints remain private and are not part of the OSS repo.
- Desktop provider registration defaults to Linux-first capabilities; keep non-Linux targets restricted until M14 verifier readiness closes.
- Use `platform/local/bin/verify-m14-xos-parity.sh` to generate machine-readable M14.7 closeout evidence for Windows/macOS restricted templates.
