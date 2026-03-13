export function createEmptyHomeSnapshot() {
  return {
    runs: { items: [] },
    approvals: { items: [] },
    audit: { items: [] }
  };
}

export function summarizeHomeOpsTriage(snapshot) {
  const runs = Array.isArray(snapshot?.runs?.items) ? snapshot.runs.items : [];
  const approvals = Array.isArray(snapshot?.approvals?.items) ? snapshot.approvals.items : [];
  const audit = Array.isArray(snapshot?.audit?.items) ? snapshot.audit.items : [];
  const terminalHistory = Array.isArray(snapshot?.terminalHistory) ? snapshot.terminalHistory : [];

  const pendingApprovals = approvals.filter(
    (item) => String(item?.status || "").trim().toUpperCase() === "PENDING"
  );
  const expiringSoonApprovals = pendingApprovals.filter((item) => {
    const expiresAt = Number.isFinite(Date.parse(item?.expiresAt || ""))
      ? Date.parse(item.expiresAt)
      : 0;
    if (expiresAt <= 0) {
      return false;
    }
    const delta = expiresAt - Date.now();
    return delta > 0 && delta <= 300000;
  });
  const attentionRuns = runs.filter((item) => {
    const status = String(item?.status || "").trim().toUpperCase();
    const decision = String(item?.policyDecision || "").trim().toUpperCase();
    return status === "FAILED" || status === "POLICY_BLOCKED" || decision === "DENY";
  });
  const latestAttentionRun =
    attentionRuns
      .slice()
      .sort((left, right) => Date.parse(right?.updatedAt || "") - Date.parse(left?.updatedAt || ""))[0] || null;
  const denyAuditEvents = audit.filter(
    (item) => String(item?.decision || "").trim().toUpperCase() === "DENY"
  );
  const terminalPolicyBlocked = terminalHistory.filter(
    (item) => String(item?.result?.status || "").trim().toUpperCase() === "POLICY_BLOCKED"
  );
  const terminalFailed = terminalHistory.filter(
    (item) => String(item?.result?.status || "").trim().toUpperCase() === "FAILED"
  );

  return {
    pendingApprovals: pendingApprovals.length,
    expiringSoonApprovals: expiringSoonApprovals.length,
    attentionRuns: attentionRuns.length,
    latestAttentionRunId: String(latestAttentionRun?.runId || "").trim(),
    denyAuditEvents: denyAuditEvents.length,
    terminalPolicyBlocked: terminalPolicyBlocked.length,
    terminalFailed: terminalFailed.length
  };
}
