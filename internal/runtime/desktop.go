package runtime

import (
	"fmt"
	"strings"
)

const (
	desktopOSLinux   = "linux"
	desktopOSWindows = "windows"
	desktopOSMacOS   = "macos"

	desktopProfileSandboxVMAutonomous = "sandbox_vm_autonomous"
	desktopProfileRestrictedHost      = "restricted_host"

	desktopTierConnectors  = 1
	desktopTierUIActuation = 2
	desktopTierHighRisk    = 3
)

var desktopDefaultVerifierIDs = []string{
	"V-M13-LNX-001",
	"V-M13-LNX-002",
	"V-M13-LNX-003",
}

type desktopExecutionPlan struct {
	Enabled    bool
	Tier       int
	Step       DesktopStepEnvelope
	Observer   JSONObject
	Actuation  JSONObject
	PostAction JSONObject
}

func deriveDesktopExecutionPlan(req RunCreateRequest, runID, policyGrantToken string, allowNonLinux bool) (*desktopExecutionPlan, error) {
	if !desktopRequestEnabled(req.Desktop) {
		return &desktopExecutionPlan{Enabled: false, Tier: desktopTierConnectors}, nil
	}

	desktopReq := req.Desktop
	tier := normalizeDesktopTier(desktopReq.Tier)
	if tier <= desktopTierConnectors {
		return &desktopExecutionPlan{Enabled: false, Tier: tier}, nil
	}

	targetOS := strings.ToLower(strings.TrimSpace(desktopReq.TargetOS))
	if targetOS == "" {
		targetOS = desktopOSLinux
	}
	switch targetOS {
	case desktopOSLinux, desktopOSWindows, desktopOSMacOS:
	default:
		return nil, fmt.Errorf("desktop.targetOS %q is invalid", desktopReq.TargetOS)
	}
	if !allowNonLinux && targetOS != desktopOSLinux {
		return nil, fmt.Errorf("desktop.targetOS %q is not enabled yet (linux only)", targetOS)
	}

	execProfile := strings.ToLower(strings.TrimSpace(desktopReq.TargetExecutionProfile))
	if execProfile == "" {
		execProfile = desktopProfileSandboxVMAutonomous
	}
	switch execProfile {
	case desktopProfileSandboxVMAutonomous:
	case desktopProfileRestrictedHost:
		if !desktopReq.RestrictedHostOptIn {
			return nil, fmt.Errorf("desktop.targetExecutionProfile %q requires desktop.restrictedHostOptIn=true", execProfile)
		}
	default:
		return nil, fmt.Errorf("desktop.targetExecutionProfile %q is invalid", desktopReq.TargetExecutionProfile)
	}

	stepID := strings.TrimSpace(desktopReq.StepID)
	if stepID == "" {
		stepID = "step-" + runID
	}

	requiredVerifierIDs := normalizeStringList(desktopReq.RequiredVerifierIDs)
	if len(requiredVerifierIDs) == 0 {
		requiredVerifierIDs = append([]string(nil), desktopDefaultVerifierIDs...)
	}

	step := DesktopStepEnvelope{
		RunID:                  runID,
		StepID:                 stepID,
		TargetOS:               targetOS,
		TargetExecutionProfile: execProfile,
		RequestedCapabilities:  normalizeStringList(desktopReq.RequestedCapabilities),
		VerifierPolicy: DesktopVerifierPolicy{
			RequiredVerifierIDs: requiredVerifierIDs,
		},
	}

	grantToken := strings.TrimSpace(policyGrantToken)
	if grantToken != "" {
		step.Grant = &DesktopGrantEnvelope{
			CapabilityGrantToken: grantToken,
		}
	}

	if tier >= desktopTierHighRisk {
		if !desktopReq.HumanApprovalGranted {
			return nil, fmt.Errorf("desktop.tier %d requires desktop.humanApprovalGranted=true", tier)
		}
		if grantToken == "" {
			return nil, fmt.Errorf("desktop.tier %d requires policy grant token", tier)
		}
	}

	observer := cloneJSONObject(desktopReq.Observer)
	if len(observer) == 0 {
		observer = JSONObject{"mode": "snapshot"}
	}

	actuation := cloneJSONObject(desktopReq.Actuation)
	if len(actuation) == 0 {
		actuation = cloneJSONObject(req.Action)
	}

	postAction := cloneJSONObject(desktopReq.PostAction)
	if len(postAction) == 0 {
		postAction = JSONObject{"verify": "post_action_state"}
	}

	return &desktopExecutionPlan{
		Enabled:    true,
		Tier:       tier,
		Step:       step,
		Observer:   observer,
		Actuation:  actuation,
		PostAction: postAction,
	}, nil
}

func desktopRequestEnabled(req *DesktopExecutionRequest) bool {
	if req == nil {
		return false
	}
	if req.Enabled {
		return true
	}
	if req.Tier != 0 {
		return true
	}
	if strings.TrimSpace(req.TargetOS) != "" || strings.TrimSpace(req.TargetExecutionProfile) != "" || strings.TrimSpace(req.StepID) != "" {
		return true
	}
	if len(req.RequestedCapabilities) > 0 || len(req.RequiredVerifierIDs) > 0 {
		return true
	}
	if len(req.Observer) > 0 || len(req.Actuation) > 0 || len(req.PostAction) > 0 {
		return true
	}
	if req.HumanApprovalGranted || req.RestrictedHostOptIn {
		return true
	}
	return false
}

func normalizeDesktopTier(tier int) int {
	if tier <= 0 {
		return desktopTierUIActuation
	}
	return tier
}

func normalizeStringList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		norm := strings.TrimSpace(value)
		if norm == "" {
			continue
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		out = append(out, norm)
	}
	return out
}

func cloneJSONObject(in JSONObject) JSONObject {
	if len(in) == 0 {
		return nil
	}
	out := make(JSONObject, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func validateDesktopDecision(operation string, resp DesktopDecisionResponse) error {
	op := strings.TrimSpace(operation)
	if strings.TrimSpace(resp.Decision) == "" {
		return fmt.Errorf("desktop %s response missing decision", op)
	}
	if strings.TrimSpace(resp.VerifierID) == "" {
		return fmt.Errorf("desktop %s response missing verifierId", op)
	}
	if strings.TrimSpace(resp.ReasonCode) == "" {
		return fmt.Errorf("desktop %s response missing reasonCode", op)
	}

	decision := strings.ToUpper(strings.TrimSpace(resp.Decision))
	if decision != "ALLOW" && decision != "DENY" {
		return fmt.Errorf("desktop %s response has unsupported decision %q", op, resp.Decision)
	}
	if decision == "DENY" {
		return fmt.Errorf(
			"desktop %s denied (verifierId=%s reasonCode=%s reasonMessage=%s)",
			op,
			strings.TrimSpace(resp.VerifierID),
			strings.TrimSpace(resp.ReasonCode),
			strings.TrimSpace(resp.ReasonMessage),
		)
	}
	return nil
}

func validateDesktopEvidence(operation string, evidence *DesktopEvidenceBundle) error {
	op := strings.ToLower(strings.TrimSpace(operation))
	requiresEvidence := op == "observe" || op == "verify"
	if !requiresEvidence && evidence == nil {
		return nil
	}
	if !desktopEvidenceComplete(evidence) {
		if requiresEvidence {
			return fmt.Errorf("desktop %s response missing required evidenceBundle", op)
		}
		return fmt.Errorf("desktop %s response included incomplete evidenceBundle", op)
	}
	return nil
}

func desktopEvidenceComplete(bundle *DesktopEvidenceBundle) bool {
	if bundle == nil {
		return false
	}
	if len(bundle.WindowMetadata) == 0 {
		return false
	}
	if !isSHA256DigestRef(bundle.ScreenshotHash) {
		return false
	}
	if strings.TrimSpace(bundle.ResultCode) == "" {
		return false
	}
	return true
}

func isSHA256DigestRef(value string) bool {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "sha256:") {
		return false
	}
	hexPart := strings.TrimPrefix(value, "sha256:")
	if len(hexPart) != 64 {
		return false
	}
	for _, ch := range hexPart {
		switch {
		case ch >= '0' && ch <= '9':
		case ch >= 'a' && ch <= 'f':
		default:
			return false
		}
	}
	return true
}
