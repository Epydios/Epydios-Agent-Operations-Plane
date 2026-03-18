# Getting Started

Use this path if you want to see the OSS baseline without digging through the full docs tree.

## What You Are Running

Epydios Agent Operations Plane is a control plane and operator workbench for governed agent tool execution with approvals and evidence.

The narrow first story is:

1. submit a governed request
2. evaluate it through policy
3. capture approval or denial
4. record evidence and audit
5. inspect the result in the desktop workbench

## Start With The OSS Baseline

From the repo root:

```bash
./platform/local/bin/verify-m0.sh
kubectl apply -k platform/modes/oss-only
```

That gives you the OSS baseline mode with no AIMXS dependency.

## Open The Operator Workbench

Follow the desktop module guide:

- [ui/desktop-ui/README.md](../ui/desktop-ui/README.md)

The main local quality path there is:

```bash
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
```

For the single canonical OSS evaluation path, use:

- [OSS quality story](quality-story.md)

## Know The Core Contract

Use these two docs next:

- [Runtime orchestration service](runtime-orchestration-service.md)
- [Governed action request contract](specs/governed-action-request-contract.md)

Those are the shortest path to understanding the runtime API and the governed request shape.

## Optional Premium Comparison

If you later want to compare OSS baseline behavior against premium AIMXS behavior, use:

- [AIMXS governed action demo](runbooks/aimxs-governed-action-demo.md)

That is intentionally not the first step for OSS evaluation.
