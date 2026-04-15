# OSS And Premium Boundary

This document states the public commercial boundary for the OSS repo.

## Public OSS Surface

The public repo ships a real OSS product surface, including:

- the public desktop and runtime codebase
- the public provider boundary
- OSS baseline workflows and verification
- public documentation for supported OSS use

## Premium Boundary

Premium delivery surfaces are separate from this repo.

The public repo may expose a boundary where a separately delivered premium provider or service can attach, but it does not ship the premium implementation itself.

## Public Rules

- premium artifacts must not be committed into this repo
- the OSS repo must remain usable without hidden premium fallback
- public docs may describe the existence of the boundary, but should not teach premium internals
- public integration surfaces should stay generic and provider-neutral where possible

## Licensing And Branding

- OSS code remains governed by [LICENSE](../LICENSE)
- brand usage remains governed by [TRADEMARK.md](../TRADEMARK.md)
- separate commercial delivery is not granted by the OSS license alone
