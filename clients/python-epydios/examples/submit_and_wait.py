from epydios_client import ClientIdentity, EpydiosClient, GovernedActionRequest


def main() -> None:
    client = EpydiosClient()
    result = client.submit_and_wait(
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
        ),
        timeout_seconds=60.0,
        poll_interval_seconds=1.0,
    )
    print(result.run_id, result.state, result.status, result.policy_decision)


if __name__ == "__main__":
    main()
