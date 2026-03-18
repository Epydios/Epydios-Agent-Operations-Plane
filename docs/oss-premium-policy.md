# OSS And Premium Policy

This document defines the commercial wall between the OSS repo and premium Epydios or AIMXS material.

## OSS Includes

The OSS repo includes:

- control-plane source code
- desktop workbench source code
- public provider contracts
- baseline OSS providers
- governed execution, approvals, receipts, audit, evidence, incident, and admin baselines
- the OSS quality story and public documentation path

## Premium Includes

Premium material can include:

- the AIMXS provider itself
- premium policy packs
- premium approval packs
- evidence-grade governance packs
- secure private connectors for high-consequence tools or actions
- certified enterprise distribution
- managed deployment, support, hardening, air-gap packaging, and SLAs
- compliance mapping, deployment sign-off, and enterprise support artifacts

## Delivery Rules

- premium artifacts must not be committed into this OSS repo
- `aimxs-full` must load premium AIMXS only from an installed premium artifact
- the default local premium path is outside the repo: `~/.epydios/premium/aimxs/extracted`
- `EPYDIOS_AIMXS_EXTRACTED_ROOT` may override that path
- missing premium AIMXS must fail clearly
- `aimxs-full` must never silently fall back to OSS behavior

## Contribution Rules For Premium Seams

Contributions to this repo may:

- improve public contracts
- improve OSS baseline providers
- improve mode selection, failure clarity, verification, and documentation
- improve tests and compatibility policy around the public boundary

Contributions to this repo must not:

- add premium AIMXS source or extracted artifacts
- make the OSS baseline depend on premium material to function
- add hidden fallback from premium modes to OSS
- collapse the provider seam into direct premium-code linkage

## Trademark And Licensing Posture

- OSS code remains under [LICENSE](../LICENSE)
- brand usage remains governed by [TRADEMARK.md](../TRADEMARK.md)
- premium branding or certification claims are not granted by the OSS license alone

## Public Packaging Stance

The OSS repo is the public control-plane and workbench codebase.

Premium AIMXS should be delivered separately as an official premium package, artifact, image, or managed endpoint. The OSS repo documents the boundary and integration path, but it does not ship the premium implementation itself.
