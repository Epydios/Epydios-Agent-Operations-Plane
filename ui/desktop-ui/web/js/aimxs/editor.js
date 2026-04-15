import { escapeHTML } from "../views/common.js";
import { normalizeAimxsMode } from "./state.js";

export function readAimxsEditorInput(root) {
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const mode = read("#settings-aimxs-mode");
  const endpointRef = read("#settings-aimxs-endpoint-ref");
  const bearerTokenRef = read("#settings-aimxs-bearer-token-ref");
  const clientTlsCertRef =
    read("#settings-aimxs-client-tls-cert-ref") || read("#settings-aimxs-mtls-cert-ref");
  const clientTlsKeyRef =
    read("#settings-aimxs-client-tls-key-ref") || read("#settings-aimxs-mtls-key-ref");
  const caCertRef = read("#settings-aimxs-ca-cert-ref");

  if (
    !(mode instanceof HTMLSelectElement) ||
    !(endpointRef instanceof HTMLInputElement) ||
    !(bearerTokenRef instanceof HTMLInputElement) ||
    !(clientTlsCertRef instanceof HTMLInputElement) ||
    !(clientTlsKeyRef instanceof HTMLInputElement) ||
    !(caCertRef instanceof HTMLInputElement)
  ) {
    return null;
  }
 
  return {
    mode: normalizeAimxsMode(mode.value, "oss-only"),
    endpointRef: String(endpointRef.value || "").trim(),
    bearerTokenRef: String(bearerTokenRef.value || "").trim(),
    clientTlsCertRef: String(clientTlsCertRef.value || "").trim(),
    clientTlsKeyRef: String(clientTlsKeyRef.value || "").trim(),
    caCertRef: String(caCertRef.value || "").trim()
  };
}

export function renderAimxsEditorFeedback(
  root,
  state,
  { settingsEditorChipClass, settingsEditorStatusLabel } = {}
) {
  if (!root) {
    return;
  }
  const chip = root.querySelector("#settings-aimxs-status-chip");
  if (chip instanceof HTMLElement && typeof settingsEditorChipClass === "function" && typeof settingsEditorStatusLabel === "function") {
    chip.className = settingsEditorChipClass(state?.status);
    chip.textContent = settingsEditorStatusLabel(state?.status);
  }

  const feedback = root.querySelector("#settings-aimxs-feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }

  const errors = Array.isArray(state?.errors) ? state.errors : [];
  const warnings = Array.isArray(state?.warnings) ? state.warnings : [];
  const message = String(state?.message || "").trim();
  const nextStep = String(state?.nextStep || "").trim();
  const parts = [];
  if (message) {
    parts.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  for (const item of errors) {
    parts.push(`<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`);
  }
  for (const item of warnings) {
    parts.push(`<div class="meta settings-editor-warn">Review before apply: ${escapeHTML(item)}</div>`);
  }
  parts.push(
    `<div class="meta">${escapeHTML(
      nextStep ||
        "Next step: confirm entitlement and valid ref:// credential references, then rerun Apply Provider Settings."
    )}</div>`
  );
  feedback.innerHTML = parts.join("");
}
