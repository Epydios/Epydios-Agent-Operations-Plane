export function setAuthDisplay(ui, session) {
  if (session.authenticated) {
    ui.authStatus.textContent = "Authenticated";
    ui.authStatus.className = "chip chip-ok";
  } else {
    ui.authStatus.textContent = "Unauthenticated";
    ui.authStatus.className = "chip chip-danger";
  }
  const tenantScope =
    session.claims.tenant_id ||
    ui.runsTenantFilter?.value ||
    ui.auditTenantFilter?.value ||
    ui.approvalsTenantFilter?.value ||
    "-";
  const projectScope =
    session.claims.project_id ||
    ui.contextProjectSelect?.value ||
    ui.runsProjectFilter?.value ||
    ui.auditProjectFilter?.value ||
    ui.approvalsProjectFilter?.value ||
    ui.rbProjectId?.value ||
    "-";
  ui.tenant.textContent = tenantScope || "-";
  ui.project.textContent = projectScope || "-";
  ui.clientId.textContent = session.claims.client_id || "-";
  ui.subject.textContent = session.claims.sub || "-";
}
