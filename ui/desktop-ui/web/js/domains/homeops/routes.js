import { renderIdentityAuthSummaryCard as renderAuthSummaryCard } from "../identityops/routes.js";
import { renderRuntimeHealthCards, renderRuntimeHealthError } from "../runtimeops/routes.js";
import { renderHomeOpsTriage } from "./panels/dashboard.js";
import { createEmptyHomeSnapshot } from "./state.js";

function normalizeHomeSnapshot(snapshot, terminalHistory) {
  return {
    ...(snapshot && typeof snapshot === "object" ? snapshot : createEmptyHomeSnapshot()),
    terminalHistory: Array.isArray(terminalHistory) ? terminalHistory : []
  };
}

export function renderHomeDashboard(ui, options = {}) {
  const snapshot = normalizeHomeSnapshot(options.snapshot, options.terminalHistory);
  renderAuthSummaryCard(ui.homeDashboardAuth, options.session || {});
  renderHomeOpsTriage(ui.triageContent, snapshot);
  if (
    Object.prototype.hasOwnProperty.call(options, "health") ||
    Object.prototype.hasOwnProperty.call(options, "pipeline")
  ) {
    renderRuntimeHealthCards(ui.healthContent, options.health || {}, options.pipeline || {});
  }
}

export function renderHomeDashboardError(ui, options = {}) {
  const snapshot = normalizeHomeSnapshot(options.snapshot, options.terminalHistory);
  renderAuthSummaryCard(ui.homeDashboardAuth, options.session || {});
  renderHomeOpsTriage(ui.triageContent, snapshot);
  renderRuntimeHealthError(ui.healthContent, options.message || "Unable to load home dashboard.");
}
