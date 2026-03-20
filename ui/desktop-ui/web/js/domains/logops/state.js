function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeValue(value, fallback = "-") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function buildLogEntry(id, title, purpose, path) {
  const normalizedPath = String(path || "").trim();
  return {
    id,
    title,
    purpose,
    path: normalizedPath,
    available: Boolean(normalizedPath)
  };
}

export function createLogOpsSnapshot(context = {}) {
  const nativeShell = readObject(context.nativeShell);
  const runtimeService = readObject(nativeShell.runtimeService);
  const gatewayService = readObject(nativeShell.gatewayService);
  const feedback =
    context?.viewState && typeof context.viewState === "object" ? context.viewState.feedback || null : null;

  const entries = [
    buildLogEntry(
      "session-events",
      "Session Event Log",
      "Native shell lifecycle events for launch, shutdown, and service transitions.",
      nativeShell.eventLogPath
    ),
    buildLogEntry(
      "ui-shell",
      "UI Shell Log",
      "Desktop shell-side logging for renderer bootstrap and native session updates.",
      nativeShell.uiLogPath
    ),
    buildLogEntry(
      "runtime-process",
      "Runtime Process Log",
      "Direct runtime bootstrap output captured from the launcher-managed process.",
      nativeShell.runtimeLogPath
    ),
    buildLogEntry(
      "runtime-service",
      "Runtime Service Log",
      "Persistent background runtime supervisor log for the local service lane.",
      runtimeService.logPath || nativeShell.serviceLogPath
    ),
    buildLogEntry(
      "gateway-service",
      "Gateway Service Log",
      "Localhost gateway service log for external submission and polling traffic.",
      gatewayService.logPath || nativeShell.gatewayLogPath
    ),
    buildLogEntry(
      "session-manifest",
      "Session Manifest",
      "Current native shell session manifest with mode, service, and diagnostics state.",
      nativeShell.sessionManifestPath
    )
  ].filter((entry) => entry.available);

  return {
    mode: normalizeValue(nativeShell.mode, "unknown"),
    launcherState: normalizeValue(nativeShell.launcherState, "unknown"),
    runtimeState: normalizeValue(nativeShell.runtimeState, "unknown"),
    runtimeServiceState: normalizeValue(runtimeService.state, "unknown"),
    gatewayServiceState: normalizeValue(gatewayService.state, "unknown"),
    startupError: String(nativeShell.startupError || "").trim(),
    feedback,
    entries
  };
}
