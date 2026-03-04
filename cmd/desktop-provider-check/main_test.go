package main

import "testing"

func TestEvaluateFixtureNoPolicy(t *testing.T) {
	fx := desktopFixture{
		CaseID:    "observe-no-policy",
		Operation: "observe",
		Request: desktopFixtureRequest{
			PolicyDecision:        "",
			RequestedCapabilities: []string{"observe.window_metadata"},
			ActionRequested:       true,
		},
	}

	got := evaluateFixture(fx)
	if got.Decision != "DENY" || got.ReasonCode != "no_policy" || got.VerifierID != "V-M13-LNX-002" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestEvaluateFixtureNoAction(t *testing.T) {
	fx := desktopFixture{
		CaseID:    "actuate-no-action",
		Operation: "actuate",
		Request: desktopFixtureRequest{
			PolicyDecision:        "ALLOW",
			RequestedCapabilities: []string{},
			ActionRequested:       false,
		},
	}

	got := evaluateFixture(fx)
	if got.Decision != "DENY" || got.ReasonCode != "no_action" || got.VerifierID != "V-M13-LNX-002" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestEvaluateFixtureVerifyAllowRequiresEvidence(t *testing.T) {
	allow := desktopFixture{
		CaseID:    "verify-allow-evidence",
		Operation: "verify",
		Request: desktopFixtureRequest{
			PolicyDecision:        "ALLOW",
			RequestedCapabilities: []string{"verify.post_action_state"},
			ActionRequested:       true,
			EvidenceBundle: &desktopEvidence{
				WindowMetadata: map[string]interface{}{"windowTitle": "Runtime"},
				ScreenshotHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				ResultCode:     "ok",
			},
		},
	}
	gotAllow := evaluateFixture(allow)
	if gotAllow.Decision != "ALLOW" || gotAllow.ReasonCode != "ok" || gotAllow.VerifierID != "V-M13-LNX-003" {
		t.Fatalf("unexpected allow result: %+v", gotAllow)
	}

	deny := allow
	deny.Request.EvidenceBundle = nil
	gotDeny := evaluateFixture(deny)
	if gotDeny.Decision != "DENY" || gotDeny.ReasonCode != "ambiguous_state" || gotDeny.VerifierID != "V-M13-LNX-003" {
		t.Fatalf("unexpected deny result: %+v", gotDeny)
	}
}
