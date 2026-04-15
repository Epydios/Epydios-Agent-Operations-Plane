# Deployment Modes

The public repo documents the OSS deployment mode:

1. `oss-only`
- uses only the shipped OSS provider path
- has no separately delivered premium dependency

## Apply

```bash
kubectl apply -k platform/modes/oss-only
```

## Note

Separately delivered provider modes and premium activation overlays are maintained outside the public repo.
