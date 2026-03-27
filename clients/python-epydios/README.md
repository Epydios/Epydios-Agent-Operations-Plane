# Python Thin Client SDK

`python-epydios` is the first thin Python client SDK slice for Epydios Agent Operations Plane.

Scope of this slice:

- submit one governed action through the localhost gateway
- poll governed-action or run status until a terminal state
- use the installed localhost gateway token by default
- stay on the locked gateway contract

This SDK does not:

- embed policy logic
- make approval decisions
- proxy arbitrary model traffic
- replace the desktop workbench or control plane

## Install

```bash
cd clients/python-epydios
./bin/install-local.sh
```

This creates an isolated local Python environment and wrapper without touching
the system Python installation. On macOS the default install root is:

```text
~/Library/Application Support/EpydiosAgentOpsDesktop/python-sdk
```

Quick smoke test after install:

```bash
"$HOME/Library/Application Support/EpydiosAgentOpsDesktop/python-sdk/bin/epydios-python" \
  -c "from epydios_client import EpydiosClient; print(EpydiosClient().health())"
```

Override the install location if needed:

```bash
EPYDIOS_PYTHON_SDK_HOME=/tmp/epydios-python-sdk ./bin/install-local.sh
```

## Example

```python
from epydios_client import ClientIdentity, EpydiosClient, GovernedActionRequest

client = EpydiosClient()

result = client.submit_governed_action(
    GovernedActionRequest(
        tenant_id="tenant-demo",
        project_id="project-core",
        environment_id="dev",
        action_type="desktop.execute",
        target_type="terminal",
        target_ref="echo EPYDIOS_GATEWAY_SMOKE_TEST",
        input={"command": "echo EPYDIOS_GATEWAY_SMOKE_TEST"},
        client=ClientIdentity(id="python-example", name="Python Example"),
        reason="Run a harmless local gateway smoke test",
    )
)

final = client.wait_for_run(result.run_id, timeout_seconds=60, poll_interval_seconds=1.0)
print(final.state, final.status, final.policy_decision)
```

## Defaults

- base URL: `http://127.0.0.1:18765`
- token env override: `EPYDIOS_GATEWAY_TOKEN`
- token path env override: `EPYDIOS_GATEWAY_TOKEN_PATH`
- base URL env override: `EPYDIOS_GATEWAY_BASE_URL`

## Local Validation

From the repo root:

```bash
python3 -m unittest discover -s clients/python-epydios/tests
```
