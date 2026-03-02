# Deployment Modes (Single Contract)

These profiles codify three deployment modes under the same `ExtensionProvider` contract.

## Modes

1. `oss-only`
- Uses only OSS policy provider routing.
- No AIMXS dependency.

2. `aimxs-hosted`
- Routes policy decisions to a hosted AIMXS HTTPS endpoint.
- Requires secure auth mode (`MTLSAndBearerTokenSecret`).

3. `aimxs-customer-hosted`
- Routes policy decisions to customer-local AIMXS endpoint (for example in-cluster or private VPC).
- No external data egress required for policy decision path.
- Requires secure auth mode (`MTLSAndBearerTokenSecret`).

## Apply

```bash
kubectl apply -k platform/modes/oss-only
kubectl apply -k platform/modes/aimxs-hosted
kubectl apply -k platform/modes/aimxs-customer-hosted
```

## Notes

- These profiles currently scope policy-provider routing. Profile/evidence providers can remain OSS or be migrated with the same pattern.
- When switching to `oss-only` from an AIMXS mode, disable or remove `aimxs-policy-primary` if it remains selected from prior applies.
- Keep hosted/customer-hosted endpoints and secret names environment-specific.
