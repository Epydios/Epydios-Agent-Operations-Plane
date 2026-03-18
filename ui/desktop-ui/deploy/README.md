# Deploying the Desktop UI for Epydios Agent Operations Plane

## Image Build

Build and tag:

```bash
docker build -t ghcr.io/epydios/epydios-agentops-desktop:0.1.0 .
```

## Base Manifests

Render base:

```bash
kubectl kustomize deploy/base
```

Apply base:

```bash
kubectl apply -k deploy/base
```

## Production Overlay

Render production:

```bash
kubectl kustomize deploy/overlays/production
```

Apply production:

```bash
kubectl apply -k deploy/overlays/production
```

## Runtime/API Wiring

- UI static site is served by nginx on `:8080`.
- nginx proxies:
  - `/v1alpha1/runtime/*` -> `orchestration-runtime.epydios-system.svc.cluster.local:8080`
  - `/v1alpha1/providers` -> `extension-provider-registry-controller.epydios-system.svc.cluster.local:8080`
- `runtime-config.json` is mounted from ConfigMap `agentops-desktop-runtime-config`.
