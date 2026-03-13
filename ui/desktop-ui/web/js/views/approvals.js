import {
  containsCaseInsensitive,
  paginateItems,
  parsePositiveInt,
  renderPanelStateMetric,
  resolveTimeBounds,
  withinTimeBounds
} from "./common.js";
import { renderGovernanceApprovalSummary } from "../domains/governanceops/components/embedded-approvals.js";
import {
  renderGovernanceApprovalReview,
  renderGovernanceApprovalReviewModal
} from "../domains/governanceops/panels/approval-trace/review.js";

function filterApprovals(items, filters) {
  const timeBounds = resolveTimeBounds(filters.timeRange, filters.timeFrom, filters.timeTo);
  const filtered = (items || []).filter((item) => {
    if (!containsCaseInsensitive(item.tenantId, filters.tenant)) {
      return false;
    }
    if (!containsCaseInsensitive(item.projectId, filters.project)) {
      return false;
    }
    if (filters.status && String(item.status || "").toUpperCase() !== filters.status) {
      return false;
    }
    if (!withinTimeBounds(item?.createdAt || item?.expiresAt || "", timeBounds)) {
      return false;
    }
    return true;
  });

  const sortBy = String(filters.sortBy || "ttl_asc").trim().toLowerCase();
  const sorted = filtered.slice();
  sorted.sort((a, b) => {
    const aExp = new Date(a?.expiresAt || 0).getTime();
    const bExp = new Date(b?.expiresAt || 0).getTime();
    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    const aStatus = String(a?.status || "").toUpperCase();
    const bStatus = String(b?.status || "").toUpperCase();
    switch (sortBy) {
      case "ttl_desc":
        return (Number.isFinite(bExp) ? bExp : 0) - (Number.isFinite(aExp) ? aExp : 0);
      case "created_desc":
        return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
      case "status":
        return aStatus.localeCompare(bStatus);
      case "ttl_asc":
      default:
        return (Number.isFinite(aExp) ? aExp : 0) - (Number.isFinite(bExp) ? bExp : 0);
    }
  });
  return sorted;
}

export function readApprovalFilters(ui) {
  const parsedTTL = parsePositiveInt(String(ui.approvalsTTLSeconds?.value || ""), 900, 60, 86400);
  const pageSize = parsePositiveInt(ui.approvalsPageSize?.value, 25, 1, 500);
  const page = parsePositiveInt(ui.approvalsPage?.value, 1, 1, 999999);
  return {
    tenant: String(ui.approvalsTenantFilter?.value || "").trim(),
    project: String(ui.approvalsProjectFilter?.value || "").trim(),
    status: String(ui.approvalsStatusFilter?.value || "").trim().toUpperCase(),
    sortBy: String(ui.approvalsSort?.value || "").trim().toLowerCase() || "ttl_asc",
    ttlSeconds: parsedTTL,
    timeRange: String(ui.approvalsTimeRange?.value || "").trim().toLowerCase(),
    timeFrom: String(ui.approvalsTimeFrom?.value || "").trim(),
    timeTo: String(ui.approvalsTimeTo?.value || "").trim(),
    pageSize,
    page,
    limit: Math.max(500, pageSize * page)
  };
}

export function renderApprovalFeedback(ui, tone, message) {
  if (!ui.approvalsFeedback) {
    return;
  }
  const title = tone === "error" ? "Approval decision failed" : tone === "ok" ? "Approval decision submitted" : "Pending Approvals";
  const state = tone === "error" ? "error" : tone === "ok" ? "success" : tone === "warn" ? "warn" : "info";
  ui.approvalsFeedback.innerHTML = renderPanelStateMetric(state, title, message || "");
}

export function renderApprovals(ui, store, approvalPayload, filters, selectedRunId = "", nativeDecisionItems = []) {
  const allItems = Array.isArray(approvalPayload?.items) ? approvalPayload.items : [];
  store.setApprovalItems(allItems);
  const filteredItems = filterApprovals(allItems, filters);
  const pageState = paginateItems(filteredItems, filters?.pageSize, filters?.page);
  if (ui.approvalsPage) {
    ui.approvalsPage.value = String(pageState.page);
  }
  if (ui.approvalsPageSize) {
    ui.approvalsPageSize.value = String(pageState.pageSize);
  }
  renderGovernanceApprovalSummary(
    ui.approvalsContent,
    approvalPayload,
    filteredItems,
    pageState,
    selectedRunId,
    nativeDecisionItems
  );
  if (filteredItems.length === 0 && (!Array.isArray(nativeDecisionItems) || nativeDecisionItems.length === 0)) {
    if (ui.approvalsDetailContent) {
      ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
        "info",
        "Approval Review",
        "Pinned approval review appears here when you select a current-thread decision or queue approval."
      );
      delete ui.approvalsDetailContent.dataset.selectedRunId;
    }
  }
}

export function renderApprovalsDetail(ui, approval) {
  renderGovernanceApprovalReview(ui.approvalsDetailContent, approval);
}

export function renderApprovalReviewModal(ui, approval) {
  renderGovernanceApprovalReviewModal(ui.approvalReviewModalContent, approval);
}
