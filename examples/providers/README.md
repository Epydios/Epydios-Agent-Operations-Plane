# ExtensionProvider Examples

These examples show the provider boundary used by the control plane.

## OSS Examples

- `extensionprovider-oss-policy.yaml` baseline OSS policy provider
- `extensionprovider-oss-evidence.yaml` baseline OSS evidence provider
- `extensionprovider-oss-profile.yaml` baseline static profile resolver
- `extensionprovider-oss-desktop-linux.yaml` Linux-first desktop execution provider (observe/actuate/verify)
- `extensionprovider-oss-desktop-openfang-linux.yaml` Linux-first Openfang adapter registration (disabled by default until upstream endpoint is configured)
- `extensionprovider-oss-desktop-openfang-mtls-bearer.yaml` Openfang secure endpoint template (`MTLSAndBearerTokenSecret`, sandbox-first, disabled by default)
- `extensionprovider-oss-desktop-openfang-windows-restricted.yaml` Windows restricted-readiness template (`selection.enabled=false`, restricted profile annotations)
- `extensionprovider-oss-desktop-openfang-macos-restricted.yaml` macOS restricted-readiness template (`selection.enabled=false`, restricted profile annotations)

## Notes

- These are examples, not production manifests.
- Endpoint URLs, secrets, and certificates should be environment-specific.
- Desktop provider registration defaults to Linux-first capabilities; keep non-Linux targets restricted until M14 verifier readiness closes.
- Use `platform/local/bin/verify-m14-xos-parity.sh` to generate machine-readable M14.7 closeout evidence for Windows/macOS restricted templates.
