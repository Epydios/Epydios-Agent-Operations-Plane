export function setAuthDisplay(ui, session) {
  if (session.authenticated) {
    ui.authStatus.textContent = "Authenticated";
    ui.authStatus.className = "chip chip-ok";
  } else {
    ui.authStatus.textContent = "Unauthenticated";
    ui.authStatus.className = "chip chip-danger";
  }
  ui.tenant.textContent = session.claims.tenant_id || "-";
  ui.project.textContent = session.claims.project_id || "-";
  ui.clientId.textContent = session.claims.client_id || "-";
  ui.subject.textContent = session.claims.sub || "-";
}
