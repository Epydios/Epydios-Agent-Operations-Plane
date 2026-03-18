# OSS Quality Story

This is the single canonical OSS evaluation path for the repo.

It uses one launch path, one test path, one demo path, and one expected result set.

## 1. Launch Path

Start the local desktop shell:

```bash
cd ui/desktop-ui
PORT=4176 ./bin/run-dev.sh
```

In a second terminal, confirm the UI is serving:

```bash
curl -sSf http://127.0.0.1:4176/ >/dev/null && echo READY
```

Expected result:

```text
READY
```

## 2. Test Path

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
```

Expected result:

```text
QC preflight passed.
```

## 3. Demo Path

From the repo root:

```bash
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
```

Expected result:

```text
M14 UI daily loop PASS.
```

## 4. What This Proves

This story proves the OSS repo can:

- launch the operator workbench locally
- pass the repo QC baseline
- pass the bounded desktop daily loop

It is intentionally OSS-first. It does not require premium AIMXS material.

If premium AIMXS is installed later, use the separate comparison path:

- [AIMXS governed action demo](runbooks/aimxs-governed-action-demo.md)
