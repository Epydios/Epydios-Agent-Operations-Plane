# AIMXS Governed Action Demo

This is the real product demo path for comparing `baseline` versus `aimxs-full`.

It uses:
- your normal local runtime startup
- the actual Desktop UI
- the same governed-action request in both modes
- the real run record in `History`

It does **not** use a script, `curl`, or hand-edited JSON as part of the demo flow.

## Goal

Submit the same finance-oriented governed action twice:
- once in `baseline`
- once in `aimxs-full`

Then compare the real stored result in `History -> Run Detail -> 2. Policy Richness`.

## Startup

### Terminal 1

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui" && export REF_FILE="/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/integration-invoke/agent-ref-values.openai.local.json" && export SCRATCH_DIR="/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m21-managed-codex-scratch" && ./bin/run-local-runtime-macos.sh --ref-values-path "$REF_FILE" --codex-workdir "$SCRATCH_DIR"
```

### Terminal 2

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui" && ./bin/run-macos-local.sh --mode live --runtime-base-url "http://127.0.0.1:18080"
```

### Browser

If the browser does not open automatically:

```bash
open "http://127.0.0.1:4173/"
```

## Demo Rule

Use the **same governed-action values** in both passes.

Only the mode changes:
- pass 1: `baseline`
- pass 2: `aimxs-full`

Do not change:
- request label
- request summary
- finance symbol
- side
- quantity
- account
- required grants
- evidence readiness
- risk tier
- boundary class
- handshake setting

Leave `Request ID` blank both times so the system creates a fresh run.

## Pass 1: Baseline

1. Click `Settings`.
2. In `Configuration`, find `AIMXS Deployment Contract`.
3. Set the mode to `baseline`.
4. Click `Activate AIMXS Mode`.
5. Wait for the activation summary to show `baseline`.
6. Click `Developer`.
7. Find `Governed Action Request`.
8. In `Request ID`, leave the field blank.
9. In `Tenant`, use the same tenant value you are already using on this live stack.
10. In `Project`, use the same project value you are already using on this live stack.
11. In `Environment`, enter `dev`.
12. In `Demo Profile`, select `Finance Paper Trade`.
13. In `Request Label`, enter:

```text
Paper Trade Request: AAPL
```

14. In `Operator Request Summary`, enter:

```text
BUY 25 AAPL in paper account paper-main
```

15. In `Symbol`, enter:

```text
AAPL
```

16. In `Side`, select `buy`.
17. In `Quantity`, enter:

```text
25
```

18. In `Account`, enter:

```text
paper-main
```

19. In `Required Grants (comma-separated)`, enter:

```text
grant.trading.supervisor
```

20. In `Evidence Readiness`, select `PARTIAL`.
21. In `Risk Tier`, select `high`.
22. In `Boundary Class`, select `external_actuator`.
23. In `Subject ID`, enter:

```text
operator-governed-action
```

24. Leave `Require handshake enforcement` checked.
25. Leave `Approved for production execution` unchecked.
26. Leave `Dry run` unchecked.
27. Do not change `Advanced request fields` unless the defaults are blank.
28. Click `Submit Governed Action`.
29. The app should move to `History` and open the new run.
30. In `Run Detail`, go to `2. Policy Richness`.
31. Record the visible values for:
   - `decision`
   - `provider`
   - `Required Grants`
   - `Evidence Readiness`
   - `Handshake Required`
   - `BAAK Engaged`
   - `Policy Stratification Present`
   - `Request Contract Echo Present`
   - `Evidence Hash`
   - `Primary Reason`

## Pass 2: AIMXS

1. Click `Settings`.
2. In `Configuration`, find `AIMXS Deployment Contract`.
3. Set the mode to `aimxs-full`.
4. Click `Activate AIMXS Mode`.
5. Wait for the activation summary to show `aimxs-full`.
6. Click `Developer`.
7. Find `Governed Action Request`.
8. In `Request ID`, leave the field blank again.
9. Re-enter the exact same values:

`Request Label`

```text
Paper Trade Request: AAPL
```

`Operator Request Summary`

```text
BUY 25 AAPL in paper account paper-main
```

`Symbol`

```text
AAPL
```

`Side`

```text
buy
```

`Quantity`

```text
25
```

`Account`

```text
paper-main
```

`Required Grants`

```text
grant.trading.supervisor
```

10. Confirm these are still the same:
    - `Evidence Readiness = PARTIAL`
    - `Risk Tier = high`
    - `Boundary Class = external_actuator`
    - `Require handshake enforcement = checked`
    - `Approved for production execution = unchecked`
    - `Dry run = unchecked`
11. Click `Submit Governed Action`.
12. The app should move to `History` and open the new run.
13. In `Run Detail`, go to `2. Policy Richness`.
14. Record the same values again:
    - `decision`
    - `provider`
    - `Required Grants`
    - `Evidence Readiness`
    - `Handshake Required`
    - `BAAK Engaged`
    - `Policy Stratification Present`
    - `Request Contract Echo Present`
    - `Evidence Hash`
    - `Primary Reason`

## Healthy Expected Difference

If the local stack is healthy, the difference should look like this:

### `baseline`

- `decision` should stay baseline, typically `ALLOW`
- `provider` should stay on the baseline provider path, not `aimxs-full`
- `BAAK Engaged` should be `false`
- `Policy Stratification Present` should be `false`
- `Request Contract Echo Present` should be `false`
- `Evidence Hash` should be blank or much less rich than AIMXS

### `aimxs-full`

- `decision` should be richer, typically `DEFER`
- `provider` should show `aimxs-full`
- `BAAK Engaged` should be `true`
- `Policy Stratification Present` should be `true`
- `Request Contract Echo Present` should be `true`
- `Evidence Hash` should be populated
- `Primary Reason` should read like a governed defer/escalation path, not a plain baseline allow

## What To Capture On Video

Record these moments:

1. `Settings -> AIMXS Deployment Contract` showing `baseline`.
2. The exact governed-action form values in `Developer`.
3. The `History -> 2. Policy Richness` result for the baseline run.
4. `Settings -> AIMXS Deployment Contract` showing `aimxs-full`.
5. The same governed-action form values again in `Developer`.
6. The `History -> 2. Policy Richness` result for the AIMXS run.
7. A final side-by-side verbal comparison using the recorded values.

## Stop Conditions

Stop the demo and treat it as a defect if any of these happen:

- the form does not submit a real run
- the app does not open the new run in `History`
- `2. Policy Richness` is missing
- `baseline` and `aimxs-full` look effectively identical
- `aimxs-full` does not show richer governance/evidence signals than the baseline path
- the only difference is cosmetic wording instead of real policy output

## If You Need A Clean Reset

1. Go back to `Settings`.
2. Set the mode to `baseline`.
3. Click `Activate AIMXS Mode`.
4. Leave the system there when you are done.
