# AIMXS Registration Examples

These manifests demonstrate how AIMXS is integrated on the public provider boundary,
not as linked code inside the OSS control plane.

- `extensionprovider-policy-https.yaml`: `PolicyProvider` over HTTPS with `MTLSAndBearerTokenSecret`
- `extensionprovider-aimxs-policy.yaml`: legacy-style policy registration example kept as a public boundary reference for private deployment repos

Use these as templates for private AIMXS deployment repos.

## Full AIMXS local mode

`aimxs-full` is now provided by the local Desktop/runtime AIMXS shim started by
`ui/desktop-ui/bin/run-macos-local.sh` in live mode. It does not use a repo
`ExtensionProvider` manifest and it must not point at the OSS placeholder path.

## AIMXS HTTPS mode

Apply the secure registration and restore policy selection:

```bash
kubectl apply -f examples/providers/aimxs-boundary/extensionprovider-policy-https.yaml
kubectl -n epydios-system patch extensionprovider aimxs-policy-primary --type=merge -p '{"spec":{"selection":{"enabled":true,"priority":900}}}'
```
