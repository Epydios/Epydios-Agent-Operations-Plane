function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatStageState(value) {
  const normalized = normalizeString(value, "pending").toLowerCase();
  if (normalized === "complete") {
    return "complete";
  }
  if (normalized === "active") {
    return "active";
  }
  if (normalized === "blocked") {
    return "blocked";
  }
  if (normalized === "recovered") {
    return "recovered";
  }
  return "pending";
}

function stageTone(state) {
  if (state === "complete" || state === "recovered") {
    return "ok";
  }
  if (state === "active") {
    return "warn";
  }
  if (state === "blocked") {
    return "danger";
  }
  return "neutral";
}

function stateLabel(state) {
  if (state === "complete") {
    return "Complete";
  }
  if (state === "active") {
    return "Active";
  }
  if (state === "blocked") {
    return "Blocked";
  }
  if (state === "recovered") {
    return "Recovered";
  }
  return "Pending";
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized && normalized !== "-") {
      return normalized;
    }
  }
  return "";
}

function normalizeArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean);
}

function looksSuccessful(value) {
  const normalized = normalizeString(value).toLowerCase();
  return [
    "approved",
    "allow",
    "applied",
    "complete",
    "completed",
    "executed",
    "issued",
    "ok",
    "recorded",
    "ready",
    "reviewed",
    "rolled_back",
    "routed",
    "sealed",
    "success"
  ].includes(normalized);
}

function looksActive(value) {
  const normalized = normalizeString(value).toLowerCase();
  return [
    "defer",
    "deferred",
    "escalated",
    "pending",
    "preview",
    "proposed",
    "queued",
    "routed",
    "running",
    "simulated",
    "submitted"
  ].includes(normalized);
}

function looksBlocked(value) {
  const normalized = normalizeString(value).toLowerCase();
  return [
    "challenge",
    "challenged",
    "deny",
    "denied",
    "error",
    "expired",
    "failed",
    "invalid"
  ].includes(normalized);
}

function buildLifecycleStage(key, label, state, value, note = "", code = false) {
  const normalizedState = formatStageState(state);
  const displayValue = normalizeString(value, "-");
  const displayNote = normalizeString(note);
  return {
    key,
    label,
    state: normalizedState,
    tone: stageTone(normalizedState),
    stateLabel: stateLabel(normalizedState),
    value: displayValue,
    note: displayNote,
    code: Boolean(code)
  };
}

function governanceState(input = {}) {
  const status = firstValue(input.decisionStatus, input.posture);
  if (looksBlocked(status)) {
    return "blocked";
  }
  if (looksSuccessful(status) || firstValue(input.approvalReceiptRef)) {
    return "complete";
  }
  if (looksActive(status) || firstValue(input.decisionRef)) {
    return "active";
  }
  return "pending";
}

function executionState(input = {}) {
  const status = firstValue(input.executionStatus, input.posture);
  if (looksBlocked(status)) {
    return "blocked";
  }
  if (looksSuccessful(status) || firstValue(input.executionRef)) {
    return "complete";
  }
  if (looksActive(status)) {
    return "active";
  }
  return "pending";
}

function receiptState(input = {}) {
  if (firstValue(input.receiptRef, input.stableRef, input.replayRef)) {
    return "complete";
  }
  return "pending";
}

function recoveryState(input = {}) {
  if (firstValue(input.recoveryRef, input.recoveryStableRef)) {
    return "recovered";
  }
  return "pending";
}

function buildReferenceItems(input = {}) {
  const refs = [];
  const pushRef = (label, value, kind) => {
    const normalized = normalizeString(value);
    if (!normalized || normalized === "-") {
      return;
    }
    refs.push({
      label,
      value: normalized,
      kind: normalizeString(kind, "trace").toLowerCase(),
      code: true
    });
  };

  pushRef("proposal", input.requestRef, "proposal");
  pushRef("decision", input.decisionRef, "decision");
  pushRef("approval receipt", input.approvalReceiptRef, "receipt");
  pushRef("execution", input.executionRef, "execution");
  pushRef("admin receipt", input.receiptRef, "receipt");
  pushRef("stable ref", input.stableRef, "stable");
  pushRef("replay ref", input.replayRef, "replay");
  normalizeArray(input.evidenceRefs)
    .slice(0, 3)
    .forEach((value, index) => pushRef(`evidence ${index + 1}`, value, "evidence"));
  pushRef("recovery", input.recoveryRef, "recovery");
  pushRef("recovery ref", input.recoveryStableRef, "stable");

  return refs;
}

export function createAimxsLegibilityModel(input = {}) {
  const requestRef = firstValue(input.requestRef);
  const actorRef = firstValue(input.actorRef);
  const subjectRef = firstValue(input.subjectRef);
  const authorityRef = firstValue(input.authorityRef);
  const grantRef = firstValue(input.grantRef);
  const posture = firstValue(input.posture);
  const scopeRef = firstValue(input.scopeRef);
  const providerRef = firstValue(input.providerRef);
  const routeRef = firstValue(input.routeRef);
  const boundaryRef = firstValue(input.boundaryRef);
  const previewRef = firstValue(input.previewRef, input.previewAt);
  const previewNote = firstValue(input.previewSummary);
  const decisionRef = firstValue(input.decisionRef);
  const decisionStatus = firstValue(input.decisionStatus);
  const approvalReceiptRef = firstValue(input.approvalReceiptRef);
  const executionRef = firstValue(input.executionRef);
  const executionStatus = firstValue(input.executionStatus);
  const receiptRef = firstValue(input.receiptRef);
  const stableRef = firstValue(input.stableRef);
  const replayRef = firstValue(input.replayRef);
  const recoveryRef = firstValue(input.recoveryRef);
  const recoveryAction = firstValue(input.recoveryAction);
  const recoveryStableRef = firstValue(input.recoveryStableRef);
  const evidenceRefs = normalizeArray(input.evidenceRefs);

  const lifecycle = [
    buildLifecycleStage(
      "ingress",
      "Governed Ingress",
      requestRef ? "complete" : "pending",
      requestRef,
      firstValue(input.sourceRef),
      true
    ),
    buildLifecycleStage(
      "identity",
      "Identity Binding",
      firstValue(actorRef, subjectRef, authorityRef, scopeRef) ? "complete" : "pending",
      firstValue(subjectRef, actorRef, authorityRef, scopeRef),
      firstValue(authorityRef, scopeRef),
      true
    ),
    buildLifecycleStage(
      "preview",
      "Bounded Preview",
      previewRef || previewNote ? "complete" : "pending",
      firstValue(previewRef, previewNote),
      previewRef && previewNote && previewRef !== previewNote ? previewNote : "",
      Boolean(previewRef)
    ),
    buildLifecycleStage(
      "governance",
      "Governance Decision",
      governanceState({
        decisionStatus,
        posture,
        decisionRef,
        approvalReceiptRef
      }),
      firstValue(decisionRef, decisionStatus, approvalReceiptRef),
      firstValue(approvalReceiptRef && decisionRef ? `approval ${approvalReceiptRef}` : ""),
      true
    ),
    buildLifecycleStage(
      "execution",
      "Execution",
      executionState({
        executionStatus,
        posture,
        executionRef
      }),
      firstValue(executionRef, executionStatus),
      "",
      true
    ),
    buildLifecycleStage(
      "receipt",
      "Receipt",
      receiptState({
        receiptRef,
        stableRef,
        replayRef
      }),
      firstValue(receiptRef, stableRef, replayRef),
      stableRef && receiptRef && stableRef !== receiptRef ? stableRef : "",
      true
    ),
    buildLifecycleStage(
      "recovery",
      "Recovery",
      recoveryState({
        recoveryRef,
        recoveryStableRef
      }),
      firstValue(recoveryRef, recoveryAction, recoveryStableRef),
      recoveryStableRef && recoveryRef && recoveryStableRef !== recoveryRef ? recoveryStableRef : "",
      true
    )
  ];

  const bindingFields = [
    { label: "actor", value: actorRef, code: true },
    { label: "subject", value: subjectRef, code: true },
    { label: "authority", value: authorityRef },
    { label: "grant", value: grantRef, code: true },
    { label: "posture", value: posture },
    { label: "scope", value: scopeRef, code: true },
    { label: "provider", value: providerRef, code: true },
    { label: "route", value: routeRef },
    { label: "boundary", value: boundaryRef, code: true }
  ].filter((field) => normalizeString(field.value));

  const refs = buildReferenceItems({
    requestRef,
    decisionRef,
    approvalReceiptRef,
    executionRef,
    receiptRef,
    stableRef,
    replayRef,
    evidenceRefs,
    recoveryRef,
    recoveryStableRef
  });

  const available = lifecycle.some((stage) => stage.value !== "-")
    || bindingFields.length > 0
    || refs.length > 0;

  return {
    available,
    lifecycle,
    bindingFields,
    refs,
    summary: firstValue(input.summary, input.note, previewNote)
  };
}
