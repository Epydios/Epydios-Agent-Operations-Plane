# Deployment Modes (Single Contract)

These profiles codify three deployment modes under the same `ExtensionProvider` contract.

## Modes

1. `oss-only`
- Uses only OSS policy provider routing.
- No AIMXS dependency.

2. `aimxs-https`
- Routes policy decisions to a AIMXS HTTPS HTTPS endpoint.
- Requires secure auth mode (`MTLSAndBearerTokenSecret`).

3. `aimxs-full`
- Names the full AIMXS contract surface.
- Desktop/runtime local troubleshooting uses the live launcher AIMXS shim instead of a hidden OSS fallback.
- Cluster-side secure wiring can still reuse the same mode name when a full AIMXS endpoint is available.

## Apply

```bash
kubectl apply -k platform/modes/oss-only
kubectl apply -k platform/modes/aimxs-https
kubectl apply -k platform/modes/aimxs-full
```

## Notes

- These profiles currently scope policy-provider routing. Profile/evidence providers can remain OSS or be migrated with the same pattern.
- When switching to `oss-only` from an AIMXS mode, disable or remove `aimxs-policy-primary` if it remains selected from prior applies.
- Keep AIMXS HTTPS endpoints and secret names environment-specific.
