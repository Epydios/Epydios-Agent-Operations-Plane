export function setAuthDisplay(ui, session) {
  if (!ui.authStatus) {
    return;
  }
  if (session.authenticated) {
    ui.authStatus.textContent = "Authenticated";
    ui.authStatus.className = "chip chip-ok";
  } else {
    ui.authStatus.textContent = "Unauthenticated";
    ui.authStatus.className = "chip chip-danger";
  }
}
