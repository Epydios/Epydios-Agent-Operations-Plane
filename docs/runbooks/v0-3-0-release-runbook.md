# v0.3.0 Release Runbook

Use this runbook to cut the first unified `v0.3.0` release for Epydios Agent Operations Plane with the renamed GHCR package family.

## Scope

This release assumes:

- GHCR images move to the `epydios-agent-operations-plane-*` prefix
- release-coupled image tags move to `0.3.0`
- the desktop UI image is released alongside the core control-plane/provider images

## Preconditions

1. Working tree is clean.
2. GitHub Actions can push packages to `ghcr.io/epydios/*`.
3. You are ready to publish these package names:
   - `ghcr.io/epydios/epydios-agent-operations-plane-extension-provider-registry-controller`
   - `ghcr.io/epydios/epydios-agent-operations-plane-oss-profile-static-resolver`
   - `ghcr.io/epydios/epydios-agent-operations-plane-runtime`
   - `ghcr.io/epydios/epydios-agent-operations-plane-oss-policy-opa-provider`
   - `ghcr.io/epydios/epydios-agent-operations-plane-oss-evidence-memory-provider`
   - `ghcr.io/epydios/epydios-agent-operations-plane-mtls-capabilities-provider`
   - `ghcr.io/epydios/epydios-agent-operations-plane-oss-desktop-provider`
   - `ghcr.io/epydios/epydios-agent-operations-plane-oss-desktop-openfang-provider`
   - `ghcr.io/epydios/epydios-agent-operations-plane-desktop`

## 1. Run Release QC

From the repo root:

```bash
go test ./...
node --test ui/desktop-ui/web/js/test/*.test.js
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
```

## 2. Push The Release Commit

Push the commit that contains:

- the GHCR workflow changes
- the `0.3.0` release-coupled image references
- the updated upgrade-policy defaults

Do not create the tag yet.

## 3. Run The GHCR Workflow Manually Once

Use `workflow_dispatch` for `.github/workflows/release-images-ghcr.yml` with:

- `image_tag`: `v0.3.0`
- `push_images`: `true`
- `registry_owner`: `Epydios` (or leave blank if the repository owner is correct)
- `platforms`: keep the default unless you want a narrower release

This produces:

- pushed GHCR images
- signed and attested image artifacts
- `release-image-digests.json`
- synced `images.lock.yaml` artifact
- synced production `patch-image-digests.yaml` artifact

## 4. Download The Release Artifacts

Download the artifact bundle from the workflow run to a local directory, for example:

```bash
ARTIFACT_DIR="$HOME/Downloads/epydios-v0.3.0-release-artifacts"
```

The directory must contain `release-image-digests.json`.

## 5. Ingest The Release Artifacts Into The Repo

From the repo root:

```bash
ARTIFACT_DIR="$HOME/Downloads/epydios-v0.3.0-release-artifacts" \
./platform/local/bin/ingest-release-artifacts.sh
```

This updates:

- `provenance/images.lock.yaml`
- `platform/overlays/production/patch-image-digests.yaml`

## 6. Review The Synced Release Diff

Check:

```bash
git diff -- provenance/images.lock.yaml platform/overlays/production/patch-image-digests.yaml
```

Sanity expectations:

- first-party images point at `ghcr.io/epydios/epydios-agent-operations-plane-*`
- `images.lock.yaml` now shows `tag: "0.3.0"` for the released first-party images
- `patch-image-digests.yaml` now uses the release digests for the production overlay

## 7. Re-run The Narrow Post-sync Checks

```bash
./platform/ci/bin/qc-preflight.sh
go test ./...
```

If you changed anything else between workflow dispatch and artifact ingest, rerun the broader UI path too:

```bash
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
```

## 8. Commit The Synced Provenance State

Create one release-sync commit after artifact ingest, for example:

```bash
git add provenance/images.lock.yaml platform/overlays/production/patch-image-digests.yaml
git commit -m "Sync v0.3.0 release digests"
git push
```

## 9. Create And Push The Annotated Tag

```bash
git tag -a v0.3.0 -m "Epydios Agent Operations Plane v0.3.0"
git push origin v0.3.0
```

The tag-triggered GHCR workflow will run again. That is acceptable. The build inputs for the released images should be unchanged by the digest-sync commit, so the published image digests should remain stable.

## 10. Final Publish Checks

Confirm:

1. The tag `v0.3.0` exists on GitHub.
2. The GHCR packages are published under the new `epydios-agent-operations-plane-*` names.
3. The repo `README` and docs front door reflect `Epydios Agent Operations Plane`.
4. `provenance/images.lock.yaml` and `platform/overlays/production/patch-image-digests.yaml` both reflect the released digests.
