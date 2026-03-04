package runtime

import "testing"

func TestDeriveDesktopExecutionPlanDefaults(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{
			"verb":   "type",
			"target": "desktop",
		},
		Desktop: &DesktopExecutionRequest{
			Enabled:               true,
			RequestedCapabilities: []string{"observe.window_metadata", "verify.post_action_state"},
		},
	}

	plan, err := deriveDesktopExecutionPlan(req, "run-123", "grant-token", false)
	if err != nil {
		t.Fatalf("deriveDesktopExecutionPlan() error = %v", err)
	}
	if !plan.Enabled {
		t.Fatalf("plan.Enabled = false, want true")
	}
	if plan.Step.TargetOS != desktopOSLinux {
		t.Fatalf("targetOS = %q, want %q", plan.Step.TargetOS, desktopOSLinux)
	}
	if plan.Step.TargetExecutionProfile != desktopProfileSandboxVMAutonomous {
		t.Fatalf("targetExecutionProfile = %q, want %q", plan.Step.TargetExecutionProfile, desktopProfileSandboxVMAutonomous)
	}
	if plan.Step.Grant == nil || plan.Step.Grant.CapabilityGrantToken != "grant-token" {
		t.Fatalf("grant token not propagated in desktop step")
	}
	if len(plan.Step.VerifierPolicy.RequiredVerifierIDs) != len(desktopDefaultVerifierIDs) {
		t.Fatalf("required verifier IDs not defaulted")
	}
}

func TestDeriveDesktopExecutionPlanTier1SkipsDesktopPath(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "type", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled: true,
			Tier:    desktopTierConnectors,
		},
	}

	plan, err := deriveDesktopExecutionPlan(req, "run-123", "", false)
	if err != nil {
		t.Fatalf("deriveDesktopExecutionPlan() error = %v", err)
	}
	if plan.Tier != desktopTierConnectors {
		t.Fatalf("plan.Tier = %d, want %d", plan.Tier, desktopTierConnectors)
	}
	if plan.Enabled {
		t.Fatalf("plan.Enabled = true, want false for tier 1")
	}
}

func TestDeriveDesktopExecutionPlanAllowsNonLinuxWhenEnabled(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "type", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled:  true,
			TargetOS: "windows",
		},
	}

	plan, err := deriveDesktopExecutionPlan(req, "run-123", "", true)
	if err != nil {
		t.Fatalf("deriveDesktopExecutionPlan() error = %v", err)
	}
	if !plan.Enabled {
		t.Fatalf("plan.Enabled = false, want true")
	}
	if plan.Step.TargetOS != desktopOSWindows {
		t.Fatalf("targetOS = %q, want %q", plan.Step.TargetOS, desktopOSWindows)
	}
}

func TestDeriveDesktopExecutionPlanRejectsNonLinuxByDefault(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "type", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled:  true,
			TargetOS: "windows",
		},
	}
	if _, err := deriveDesktopExecutionPlan(req, "run-123", "", false); err == nil {
		t.Fatalf("expected error for non-linux target when allowNonLinux=false")
	}
}

func TestDeriveDesktopExecutionPlanRestrictedHostRequiresOptIn(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "type", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled:                true,
			TargetExecutionProfile: desktopProfileRestrictedHost,
		},
	}
	if _, err := deriveDesktopExecutionPlan(req, "run-123", "", true); err == nil {
		t.Fatalf("expected error for restricted host without opt-in")
	}
}

func TestDeriveDesktopExecutionPlanRestrictedHostWithOptInPasses(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "type", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled:                true,
			TargetExecutionProfile: desktopProfileRestrictedHost,
			RestrictedHostOptIn:    true,
		},
	}
	plan, err := deriveDesktopExecutionPlan(req, "run-123", "", false)
	if err != nil {
		t.Fatalf("deriveDesktopExecutionPlan() error = %v", err)
	}
	if !plan.Enabled {
		t.Fatalf("plan.Enabled = false, want true")
	}
	if plan.Step.TargetExecutionProfile != desktopProfileRestrictedHost {
		t.Fatalf("targetExecutionProfile = %q, want %q", plan.Step.TargetExecutionProfile, desktopProfileRestrictedHost)
	}
}

func TestDeriveDesktopExecutionPlanTier3RequiresApprovalAndGrant(t *testing.T) {
	req := RunCreateRequest{
		Action: JSONObject{"verb": "click", "target": "desktop"},
		Desktop: &DesktopExecutionRequest{
			Enabled:               true,
			Tier:                  desktopTierHighRisk,
			RequestedCapabilities: []string{"actuate.window_focus"},
		},
	}
	if _, err := deriveDesktopExecutionPlan(req, "run-123", "", false); err == nil {
		t.Fatalf("expected tier3 validation error without approval/grant")
	}

	req.Desktop.HumanApprovalGranted = true
	if _, err := deriveDesktopExecutionPlan(req, "run-123", "", false); err == nil {
		t.Fatalf("expected tier3 validation error without policy grant token")
	}

	plan, err := deriveDesktopExecutionPlan(req, "run-123", "grant-token", false)
	if err != nil {
		t.Fatalf("expected tier3 plan to pass with approval+grant, got error %v", err)
	}
	if !plan.Enabled {
		t.Fatalf("plan.Enabled = false, want true")
	}
}

func TestValidateDesktopDecision(t *testing.T) {
	allow := DesktopDecisionResponse{
		Decision:   "ALLOW",
		VerifierID: "V-M13-LNX-001",
		ReasonCode: "ok",
	}
	if err := validateDesktopDecision("observe", allow); err != nil {
		t.Fatalf("validateDesktopDecision(ALLOW) error = %v", err)
	}

	deny := DesktopDecisionResponse{
		Decision:   "DENY",
		VerifierID: "V-M13-LNX-002",
		ReasonCode: "no_action",
	}
	if err := validateDesktopDecision("actuate", deny); err == nil {
		t.Fatalf("expected deny decision to return error")
	}
}

func TestValidateDesktopEvidence(t *testing.T) {
	valid := &DesktopEvidenceBundle{
		WindowMetadata: JSONObject{"title": "Example"},
		ScreenshotHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		ResultCode:     "ok",
	}
	if err := validateDesktopEvidence("observe", valid); err != nil {
		t.Fatalf("validateDesktopEvidence(valid) error = %v", err)
	}
	if err := validateDesktopEvidence("verify", nil); err == nil {
		t.Fatalf("expected verify evidence validation error for nil bundle")
	}
}
