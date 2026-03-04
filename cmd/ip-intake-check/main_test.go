package main

import "testing"

func TestValidateRegisterOK(t *testing.T) {
	reg := register{
		SchemaVersion: 1,
		GeneratedUTC:  "2026-03-04T00:00:00Z",
		Policy: registerPolicy{
			AllowedLinkageLicenses: []string{
				"Apache-2.0",
				"MIT",
				"BSD-3-Clause",
			},
			CopyleftLicenses: []string{
				"AGPL-3.0",
			},
		},
		Entries: []registerItem{
			{
				ID:        "desktop-provider-contract-v1alpha1",
				Name:      "DesktopProvider contract",
				IPType:    "first_party_new_ip",
				SourceRef: "contracts/extensions/v1alpha1",
				License:   "Proprietary-Internal",
				Linkage:   "planned",
				Status:    "pending_review",
				Owner:     "desktop-platform",
				Review: reviewInfo{
					Required: true,
					Status:   "pending",
					Ticket:   "M13-IP-001",
				},
			},
			{
				ID:        "playwright",
				Name:      "playwright",
				IPType:    "upstream_oss",
				SourceURL: "https://github.com/microsoft/playwright",
				SourceRef: "6ae6e049fefe",
				License:   "Apache-2.0",
				Linkage:   "planned",
				Status:    "pending_review",
				Owner:     "desktop-platform",
				Review: reviewInfo{
					Required: false,
					Status:   "not_required",
				},
			},
			{
				ID:        "ydotool",
				Name:      "ydotool",
				IPType:    "upstream_oss",
				SourceURL: "https://github.com/ReimuNotMoe/ydotool",
				SourceRef: "708e96ff27e3",
				License:   "AGPL-3.0",
				Linkage:   "reference_only",
				Status:    "blocked",
				Owner:     "desktop-platform",
				Review: reviewInfo{
					Required: false,
					Status:   "not_required",
				},
			},
		},
	}

	errs := validateRegister(reg)
	if len(errs) != 0 {
		t.Fatalf("expected 0 validation errors, got %d: %v", len(errs), errs)
	}
}

func TestValidateRegisterRejectsCopyleftLinkage(t *testing.T) {
	reg := register{
		SchemaVersion: 1,
		GeneratedUTC:  "2026-03-04T00:00:00Z",
		Policy: registerPolicy{
			AllowedLinkageLicenses: []string{
				"Apache-2.0",
				"MIT",
			},
			CopyleftLicenses: []string{
				"AGPL-3.0",
			},
		},
		Entries: []registerItem{
			{
				ID:        "ydotool",
				Name:      "ydotool",
				IPType:    "upstream_oss",
				SourceURL: "https://github.com/ReimuNotMoe/ydotool",
				License:   "AGPL-3.0",
				Linkage:   "planned",
				Status:    "pending_review",
				Owner:     "desktop-platform",
				Review: reviewInfo{
					Required: false,
					Status:   "not_required",
				},
			},
		},
	}

	errs := validateRegister(reg)
	if len(errs) == 0 {
		t.Fatalf("expected validation errors for AGPL planned linkage")
	}
}
