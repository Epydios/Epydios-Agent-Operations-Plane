# Provenance and Lockfiles

This directory holds the repo-tracked machine-readable deployment and accountability lockfiles for the OSS control plane.

The goal is to keep the committed provenance surface narrow, reviewable, and automatable.

What belongs here:

- lockfiles such as image, chart, CRD, and license pins
- machine-readable OSS intake and first-party IP accountability data
- generated machine-readable provenance artifacts when a workflow explicitly writes them here

What does not belong here:

- separately delivered non-OSS release-process documentation
- private packaging metadata
- private release evidence payloads
- raw operational logs that make the OSS repo look incomplete or workspace-dependent

Separately delivered non-OSS release metadata and evidence remain outside the public repo. Public provenance in this directory is limited to OSS lockfiles and OSS accountability artifacts.

## Validation Gate

Run lockfile validation in development mode (structure and pin sanity, warnings for unresolved release data):

```bash
./platform/local/bin/verify-provenance-lockfiles.sh
```

Run strict release mode (blocking for unresolved required image digests and unverified required licenses):

```bash
STRICT=1 ./platform/local/bin/verify-provenance-lockfiles.sh
```

Run IP intake governance validation (first-party IP declarations + OSS linkage/license policy):

```bash
./platform/ci/bin/check-ip-intake-register.sh
```

Use strict mode as the release gate after digests and license verification are fully populated.

Strict mode also rejects placeholder digests for release-synced image entries, including all-zero
SHA-256 values such as `sha256:000...000`.

Release image digests are produced by:

```bash
.github/workflows/release-images-ghcr.yml
```

The workflow emits:
- `release-image-digests.json`
- `release-image-digests.md`
- per-component signature/attestation verification artifacts in `release-digest-*` artifacts
- per-component SBOM (`*.sbom.spdx.json`) and vulnerability report (`*.trivy.json`) artifacts
- strict lockfile validation output by running `go run ./cmd/provenance-lock-check -strict -repo-root dist/repo-root` on the synced artifact before publish

These artifacts are the CI handoff for lockfile sync automation.

CI lockfile sync entrypoint:

```bash
./platform/ci/bin/sync-release-digests-to-lockfile.sh
```

Expected CI inputs:
- `DIGEST_MANIFEST` (for example `dist/release-image-digests.json`)
- `LOCKFILE` (target `images.lock.yaml` path)

This syncs component `tag` + immutable `digest` fields and stamps `status: release-synced`.

Auto-sync image digests from live cluster image IDs and (optionally) registry pulls:

```bash
./platform/local/bin/sync-provenance-image-digests.sh
```

Allow registry pulls for unresolved tags:

```bash
ALLOW_DOCKER_PULL=1 ./platform/local/bin/sync-provenance-image-digests.sh
```

## Files

- `charts.lock.yaml` Helm/OCI chart versions
- `images.lock.yaml` image tags and digests
- `crds.lock.yaml` CRD source/version references
- `licenses.lock.yaml` license expectations and verification status
- `ip/intake-register.json` machine-readable OSS-intake and first-party IP governance register

Generated release or promotion artifacts are created on demand and should not require committed placeholder directories.

## Relationship to Workspace-Level Provenance

The workspace root also contains:

- `../provenance/third_party_sources.yaml`

That file tracks local upstream source clones and zip backups. These repo-local lockfiles track what the control plane actually deploys.

## Filling Image Digests

Use `images.lock.yaml` as the source of truth for image tags first, then fill `digest` values after the image is pushed.

Example flow (per image):

```bash
IMAGE=ghcr.io/epydios/epydios-agent-operations-plane-extension-provider-registry-controller
TAG=0.3.0
crane digest "${IMAGE}:${TAG}"
```

Alternative with Docker Buildx:

```bash
docker buildx imagetools inspect "${IMAGE}:${TAG}" --format '{{json .Manifest.Digest}}'
```

Update the corresponding `digest: sha256:...` entry in `images.lock.yaml` only after verifying the tag matches the intended build commit.
