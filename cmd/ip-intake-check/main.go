package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type register struct {
	SchemaVersion int            `json:"schema_version"`
	GeneratedUTC  string         `json:"generated_utc"`
	Policy        registerPolicy `json:"policy"`
	Entries       []registerItem `json:"entries"`
}

type registerPolicy struct {
	AllowedLinkageLicenses []string `json:"allowed_linkage_licenses"`
	CopyleftLicenses       []string `json:"copyleft_licenses"`
	Notes                  []string `json:"notes"`
}

type registerItem struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	IPType    string     `json:"ip_type"`
	SourceURL string     `json:"source_url"`
	SourceRef string     `json:"source_ref"`
	License   string     `json:"license"`
	Linkage   string     `json:"linkage"`
	Status    string     `json:"status"`
	Owner     string     `json:"owner"`
	Review    reviewInfo `json:"review"`
	Notes     string     `json:"notes"`
}

type reviewInfo struct {
	Required bool     `json:"required"`
	Status   string   `json:"status"`
	Ticket   string   `json:"ticket"`
	Evidence []string `json:"evidence"`
}

var allowedIPTypes = map[string]struct{}{
	"upstream_oss":              {},
	"first_party_new_ip":        {},
	"external_private_provider": {},
}

var allowedLinkages = map[string]struct{}{
	"none":           {},
	"planned":        {},
	"shipped":        {},
	"reference_only": {},
}

var allowedStatuses = map[string]struct{}{
	"pending_review": {},
	"approved":       {},
	"blocked":        {},
}

var allowedReviewStatuses = map[string]struct{}{
	"not_required": {},
	"pending":      {},
	"approved":     {},
	"blocked":      {},
}

func main() {
	var repoRoot string
	var registerPath string
	flag.StringVar(&repoRoot, "repo-root", ".", "path to repository root")
	flag.StringVar(&registerPath, "register", "provenance/ip/intake-register.json", "path to machine-readable IP intake register")
	flag.Parse()

	rootAbs, err := filepath.Abs(repoRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve repo-root: %v\n", err)
		os.Exit(2)
	}
	registerAbs := registerPath
	if !filepath.IsAbs(registerAbs) {
		registerAbs = filepath.Join(rootAbs, registerPath)
	}

	r, err := parseRegister(registerAbs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ip intake register check failed: %v\n", err)
		os.Exit(1)
	}

	errs := validateRegister(r)
	fmt.Printf("IP intake register: entries=%d errors=%d\n", len(r.Entries), len(errs))
	if len(errs) > 0 {
		for _, msg := range errs {
			fmt.Printf("ERROR: %s\n", msg)
		}
		fmt.Fprintf(os.Stderr, "ip intake register check failed: %v\n", errors.New("one or more blocking checks failed"))
		os.Exit(1)
	}

	fmt.Println("IP intake register check passed.")
}

func parseRegister(path string) (register, error) {
	f, err := os.Open(path)
	if err != nil {
		return register{}, fmt.Errorf("open register %q: %w", path, err)
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	var r register
	if err := dec.Decode(&r); err != nil {
		return register{}, fmt.Errorf("decode register %q: %w", path, err)
	}
	var trailing struct{}
	if err := dec.Decode(&trailing); err != io.EOF {
		return register{}, fmt.Errorf("decode register %q: trailing content is not allowed", path)
	}
	return r, nil
}

func validateRegister(r register) []string {
	var errs []string
	addErr := func(format string, args ...any) {
		errs = append(errs, fmt.Sprintf(format, args...))
	}

	if r.SchemaVersion != 1 {
		addErr("schema_version must be 1 (got %d)", r.SchemaVersion)
	}
	if strings.TrimSpace(r.GeneratedUTC) == "" {
		addErr("generated_utc is required")
	}
	if len(r.Policy.AllowedLinkageLicenses) == 0 {
		addErr("policy.allowed_linkage_licenses must not be empty")
	}
	if len(r.Entries) == 0 {
		addErr("entries must not be empty")
	}

	allowedLicenses := toExactSet(r.Policy.AllowedLinkageLicenses)
	copyleftLicenses := toExactSet(r.Policy.CopyleftLicenses)
	seenIDs := map[string]struct{}{}

	for i, e := range r.Entries {
		id := strings.TrimSpace(e.ID)
		scope := fmt.Sprintf("entries[%d] id=%q", i, id)
		if id == "" {
			addErr("entries[%d] missing id", i)
		} else if _, ok := seenIDs[id]; ok {
			addErr("%s is duplicated", scope)
		} else {
			seenIDs[id] = struct{}{}
		}
		if strings.TrimSpace(e.Name) == "" {
			addErr("%s missing name", scope)
		}
		ipType := normalize(e.IPType)
		if _, ok := allowedIPTypes[ipType]; !ok {
			addErr("%s ip_type=%q is not allowed", scope, e.IPType)
		}
		linkage := normalize(e.Linkage)
		if _, ok := allowedLinkages[linkage]; !ok {
			addErr("%s linkage=%q is not allowed", scope, e.Linkage)
		}
		status := normalize(e.Status)
		if _, ok := allowedStatuses[status]; !ok {
			addErr("%s status=%q is not allowed", scope, e.Status)
		}
		if strings.TrimSpace(e.Owner) == "" {
			addErr("%s missing owner", scope)
		}

		reviewStatus := normalize(e.Review.Status)
		if _, ok := allowedReviewStatuses[reviewStatus]; !ok {
			addErr("%s review.status=%q is not allowed", scope, e.Review.Status)
		}
		if e.Review.Required {
			if strings.TrimSpace(e.Review.Ticket) == "" {
				addErr("%s review.required=true but review.ticket is empty", scope)
			}
			if reviewStatus == "not_required" {
				addErr("%s review.required=true but review.status is not_required", scope)
			}
		}

		license := strings.TrimSpace(e.License)

		switch ipType {
		case "upstream_oss":
			if strings.TrimSpace(e.SourceURL) == "" {
				addErr("%s upstream_oss requires source_url", scope)
			}
			if license == "" {
				addErr("%s upstream_oss requires license", scope)
			}
			if linkage == "planned" || linkage == "shipped" {
				if _, ok := allowedLicenses[license]; !ok {
					addErr("%s planned/shipped upstream_oss requires a permissive allowed license (got %q)", scope, license)
				}
			}
			if _, copyleft := copyleftLicenses[license]; copyleft && linkage != "reference_only" && linkage != "none" {
				addErr("%s copyleft license %q requires linkage reference_only/none (got %q)", scope, license, linkage)
			}
		case "first_party_new_ip":
			if strings.TrimSpace(e.SourceRef) == "" {
				addErr("%s first_party_new_ip requires source_ref", scope)
			}
			if !e.Review.Required {
				addErr("%s first_party_new_ip requires review.required=true", scope)
			}
			if linkage == "shipped" && reviewStatus != "approved" {
				addErr("%s shipped first_party_new_ip requires review.status=approved", scope)
			}
		case "external_private_provider":
			if strings.TrimSpace(e.SourceRef) == "" && strings.TrimSpace(e.SourceURL) == "" {
				addErr("%s external_private_provider requires source_ref or source_url", scope)
			}
			if linkage == "shipped" && reviewStatus == "not_required" {
				addErr("%s shipped external_private_provider requires explicit review status", scope)
			}
		}
	}

	return errs
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func toExactSet(items []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		out[trimmed] = struct{}{}
	}
	return out
}
