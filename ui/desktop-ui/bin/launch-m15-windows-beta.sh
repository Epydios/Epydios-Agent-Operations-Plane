#!/usr/bin/env bash
set -euo pipefail

shell_path() {
  local candidate="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "${candidate}"
    return
  fi
  printf '%s\n' "${candidate}"
}

windows_path() {
  local candidate="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "${candidate}"
    return
  fi
  printf '%s\n' "${candidate}"
}

start_windows_app() {
  local install_path_native="$1"
  local install_root_native="$2"
  local bootstrap_path_native="$3"
  shift 3 || true

  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[System.Environment]::SetEnvironmentVariable('EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH','${bootstrap_path_native}','Process'); Start-Process -FilePath '${install_path_native}' -WorkingDirectory '${install_root_native}'"
    return $?
  fi

  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe //c "set \"EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH=${bootstrap_path_native}\" && start \"\" \"${install_path_native}\""
    return $?
  fi

  echo "launch-m15-windows-beta failed: expected powershell.exe or cmd.exe on the Windows host." >&2
  return 1
}

read_bootstrap_field() {
  local jq_expr="$1"
  if command -v jq >/dev/null 2>&1 && [ -f "${BOOTSTRAP_PATH}" ]; then
    jq -r "${jq_expr}" "${BOOTSTRAP_PATH}" 2>/dev/null || true
    return
  fi
  printf '\n'
}

LOCAL_APPDATA_ROOT="$(shell_path "${LOCALAPPDATA:-${USERPROFILE:-${HOME}}/AppData/Local}")"
ROAMING_APPDATA_ROOT="$(shell_path "${APPDATA:-${USERPROFILE:-${HOME}}/AppData/Roaming}")"

INSTALL_ROOT="${EPYDIOS_M15_WINDOWS_INSTALL_ROOT:-${LOCAL_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
SUPPORT_ROOT="${EPYDIOS_M15_WINDOWS_SUPPORT_ROOT:-${ROAMING_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/Epydios AgentOps Desktop.exe"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
SESSION_ROOT="${LOCAL_APPDATA_ROOT}/EpydiosAgentOpsDesktop/native-shell"
INSTALL_PATH_NATIVE="$(windows_path "${INSTALL_PATH}")"
INSTALL_ROOT_NATIVE="$(windows_path "${INSTALL_ROOT}")"
BOOTSTRAP_PATH_NATIVE="$(windows_path "${BOOTSTRAP_PATH}")"

latest_manifest_before="$(find "${SESSION_ROOT}" -name session.json -print 2>/dev/null | sort | tail -n1 || true)"

[ -f "${INSTALL_PATH}" ] || {
  echo "launch-m15-windows-beta failed: Windows beta installed evaluation lane executable missing at ${INSTALL_PATH}" >&2
  exit 1
}
[ -f "${BOOTSTRAP_PATH}" ] || {
  echo "launch-m15-windows-beta failed: Windows beta installed evaluation lane bootstrap config missing at ${BOOTSTRAP_PATH}" >&2
  exit 1
}

bootstrap_mode="$(read_bootstrap_field '.mode // ""')"
runtime_namespace="$(read_bootstrap_field '.runtimeNamespace // "epydios-system"')"
runtime_service="$(read_bootstrap_field '.runtimeService // "orchestration-runtime"')"

if [ "${bootstrap_mode}" = "live" ]; then
  if ! command -v kubectl >/dev/null 2>&1; then
    echo "launch-m15-windows-beta failed: Windows beta installed evaluation lane in live mode requires kubectl on the Windows host. Run bash ./ui/desktop-ui/bin/bootstrap-m15-windows.sh first." >&2
    exit 1
  fi
  if ! kubectl -n "${runtime_namespace}" get svc "${runtime_service}" -o name >/dev/null 2>&1; then
    echo "launch-m15-windows-beta failed: Windows beta installed evaluation lane in live mode requires a reachable Kubernetes service ${runtime_namespace}/${runtime_service}. The current kube context on this Windows host is not ready." >&2
    exit 1
  fi
fi

start_windows_app "${INSTALL_PATH_NATIVE}" "${INSTALL_ROOT_NATIVE}" "${BOOTSTRAP_PATH_NATIVE}" "$@"

deadline=$((SECONDS + 20))
while [ "${SECONDS}" -lt "${deadline}" ]; do
  latest_manifest_after="$(find "${SESSION_ROOT}" -name session.json -print 2>/dev/null | sort | tail -n1 || true)"
  if [ -n "${latest_manifest_after}" ] && [ "${latest_manifest_after}" != "${latest_manifest_before}" ]; then
    event_log="$(dirname "${latest_manifest_after}")/logs/session-events.jsonl"
    if [ -f "${event_log}" ] && grep -q '"event":"native_window_dom_ready"' "${event_log}"; then
      echo "launch-m15-windows-beta: launched installed app successfully"
      exit 0
    fi
  fi
  sleep 1
done

echo "launch-m15-windows-beta failed: launch was requested but no new native session reached DOM ready. Check ${SESSION_ROOT} for the newest session logs." >&2
exit 1
