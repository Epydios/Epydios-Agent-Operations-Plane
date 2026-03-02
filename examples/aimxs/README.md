# AIMXS Registration Examples

These manifests demonstrate how AIMXS is integrated as an external HTTPS provider target,
not as linked code inside the OSS control plane.

- `extensionprovider-policy-local-dev.yaml`: local dev loopback profile (`auth.mode=None`, disabled by default)
- `extensionprovider-policy-mtls-bearer.yaml`: `PolicyProvider` over HTTPS with `MTLSAndBearerTokenSecret`

Use these as templates for private AIMXS deployment repos.

## Local dev bootstrap (before private AIMXS endpoint is live)

Apply the local dev template (does not take traffic by default):

```bash
kubectl apply -f examples/aimxs/extensionprovider-policy-local-dev.yaml
```

Temporarily route policy traffic through the local AIMXS placeholder:

```bash
kubectl -n epydios-system patch extensionprovider oss-policy-opa --type=merge -p '{"spec":{"selection":{"enabled":false,"priority":90}}}'
kubectl -n epydios-system patch extensionprovider aimxs-policy-local-dev --type=merge -p '{"spec":{"selection":{"enabled":true,"priority":850}}}'
```

## Switch to private AIMXS secure endpoint

Apply the secure registration and restore policy selection:

```bash
kubectl apply -f examples/aimxs/extensionprovider-policy-mtls-bearer.yaml
kubectl -n epydios-system patch extensionprovider aimxs-policy-local-dev --type=merge -p '{"spec":{"selection":{"enabled":false,"priority":850}}}'
kubectl -n epydios-system patch extensionprovider aimxs-policy-primary --type=merge -p '{"spec":{"selection":{"enabled":true,"priority":900}}}'
```

`extensionprovider-policy-local-dev.yaml` is for local development only and must not be used in staging/prod.
