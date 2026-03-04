# ExtensionProvider Examples

These examples show how the OSS control plane can run with OSS providers and later switch to AIMXS providers without changing the control-plane core.

## Files

- `extensionprovider-oss-policy.yaml` baseline OSS policy provider
- `extensionprovider-oss-evidence.yaml` baseline OSS evidence provider
- `extensionprovider-oss-profile.yaml` baseline static profile resolver
- `extensionprovider-oss-desktop-linux.yaml` Linux-first desktop execution provider (observe/actuate/verify)
- `extensionprovider-aimxs-policy.yaml` private AIMXS policy provider registration (licensed plug-in slot)

## Notes

- These are examples, not production manifests.
- Endpoint URLs, secrets, and certificates should be environment-specific.
- AIMXS images/endpoints remain private and are not part of the OSS repo.
- Desktop provider registration defaults to Linux-first capabilities; keep non-Linux targets restricted until M14 verifier readiness closes.
