package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type openAPISpec struct {
	Tags       []openAPITag             `yaml:"tags"`
	Paths      map[string]openAPIPath   `yaml:"paths"`
	Components openAPIComponentsSection `yaml:"components"`
}

type openAPITag struct {
	Name string `yaml:"name"`
}

type openAPIPath struct {
	Post *openAPIOperation `yaml:"post"`
}

type openAPIOperation struct {
	OperationID string                     `yaml:"operationId"`
	RequestBody *openAPIRequestBody        `yaml:"requestBody"`
	Responses   map[string]openAPIResponse `yaml:"responses"`
}

type openAPIRequestBody struct {
	Required bool                        `yaml:"required"`
	Content  map[string]openAPIMediaType `yaml:"content"`
}

type openAPIResponse struct {
	Ref     string                      `yaml:"$ref"`
	Content map[string]openAPIMediaType `yaml:"content"`
}

type openAPIMediaType struct {
	Schema openAPISchemaRef `yaml:"schema"`
}

type openAPISchemaRef struct {
	Ref string `yaml:"$ref"`
}

type openAPIComponentsSection struct {
	Schemas map[string]openAPISchema `yaml:"schemas"`
}

type openAPISchema struct {
	Type       string                     `yaml:"type"`
	Required   []string                   `yaml:"required"`
	Properties map[string]openAPIProperty `yaml:"properties"`
	AllOf      []openAPISchemaRef         `yaml:"allOf"`
}

type openAPIProperty struct {
	Ref        string                     `yaml:"$ref"`
	Type       string                     `yaml:"type"`
	Enum       []string                   `yaml:"enum"`
	Required   []string                   `yaml:"required"`
	Properties map[string]openAPIProperty `yaml:"properties"`
	Items      *openAPIProperty           `yaml:"items"`
}

type extensionProviderCRD struct {
	Spec struct {
		Versions []struct {
			Name   string `yaml:"name"`
			Schema struct {
				OpenAPIV3Schema crdNode `yaml:"openAPIV3Schema"`
			} `yaml:"schema"`
		} `yaml:"versions"`
	} `yaml:"spec"`
}

type crdNode struct {
	Properties map[string]crdNode `yaml:"properties"`
	Enum       []string           `yaml:"enum"`
}

type desktopFixture struct {
	CaseID    string                 `json:"caseId"`
	Operation string                 `json:"operation"`
	Request   desktopFixtureRequest  `json:"request"`
	Expected  desktopFixtureExpected `json:"expected"`
}

type desktopFixtureRequest struct {
	PolicyDecision        string           `json:"policyDecision"`
	RequestedCapabilities []string         `json:"requestedCapabilities"`
	ActionRequested       bool             `json:"actionRequested"`
	EvidenceBundle        *desktopEvidence `json:"evidenceBundle,omitempty"`
}

type desktopEvidence struct {
	WindowMetadata map[string]interface{} `json:"windowMetadata"`
	ScreenshotHash string                 `json:"screenshotHash"`
	ResultCode     string                 `json:"resultCode"`
}

type desktopFixtureExpected struct {
	Decision   string `json:"decision"`
	ReasonCode string `json:"reasonCode"`
	VerifierID string `json:"verifierId"`
}

func main() {
	var repoRoot string
	var contractPath string
	var crdPath string
	var fixtureDir string

	flag.StringVar(&repoRoot, "repo-root", ".", "path to repository root")
	flag.StringVar(&contractPath, "contract", "contracts/extensions/v1alpha1/provider-contracts.openapi.yaml", "path to provider contract OpenAPI document")
	flag.StringVar(&crdPath, "crd", "contracts/extensions/v1alpha1/provider-registration-crd.yaml", "path to ExtensionProvider registration CRD")
	flag.StringVar(&fixtureDir, "fixtures", "platform/tests/desktop-provider/requests", "path to desktop provider verifier fixtures")
	flag.Parse()

	rootAbs, err := filepath.Abs(repoRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve repo-root: %v\n", err)
		os.Exit(2)
	}
	contractAbs := absFromRoot(rootAbs, contractPath)
	crdAbs := absFromRoot(rootAbs, crdPath)
	fixtureAbs := absFromRoot(rootAbs, fixtureDir)

	errs := runChecks(contractAbs, crdAbs, fixtureAbs)
	fmt.Printf("Desktop provider check: errors=%d\n", len(errs))
	if len(errs) > 0 {
		for _, msg := range errs {
			fmt.Printf("ERROR: %s\n", msg)
		}
		fmt.Fprintf(os.Stderr, "desktop provider check failed: %v\n", errors.New("one or more blocking checks failed"))
		os.Exit(1)
	}
	fmt.Println("Desktop provider check passed.")
}

func runChecks(contractPath, crdPath, fixtureDir string) []string {
	var errs []string
	addErr := func(format string, args ...any) {
		errs = append(errs, fmt.Sprintf(format, args...))
	}

	spec, err := loadOpenAPISpec(contractPath)
	if err != nil {
		addErr("load contract: %v", err)
	} else {
		errs = append(errs, validateContract(spec)...)
	}

	crd, err := loadCRD(crdPath)
	if err != nil {
		addErr("load CRD: %v", err)
	} else {
		errs = append(errs, validateCRD(crd)...)
	}

	fixtures, err := loadFixtures(fixtureDir)
	if err != nil {
		addErr("load fixtures: %v", err)
	} else {
		errs = append(errs, validateFixtures(fixtures)...)
	}

	return errs
}

func loadOpenAPISpec(path string) (*openAPISpec, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var spec openAPISpec
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		return nil, err
	}
	return &spec, nil
}

func loadCRD(path string) (*extensionProviderCRD, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out extensionProviderCRD
	if err := yaml.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func loadFixtures(dir string) ([]desktopFixture, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		if strings.HasSuffix(ent.Name(), ".json") {
			files = append(files, filepath.Join(dir, ent.Name()))
		}
	}
	sort.Strings(files)
	if len(files) == 0 {
		return nil, fmt.Errorf("no JSON fixtures found in %s", dir)
	}

	out := make([]desktopFixture, 0, len(files))
	for _, p := range files {
		raw, err := os.ReadFile(p)
		if err != nil {
			return nil, err
		}
		var fx desktopFixture
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&fx); err != nil {
			return nil, fmt.Errorf("decode %s: %w", p, err)
		}
		out = append(out, fx)
	}
	return out, nil
}

func validateContract(spec *openAPISpec) []string {
	var errs []string
	addErr := func(format string, args ...any) {
		errs = append(errs, fmt.Sprintf(format, args...))
	}

	if !hasTag(spec.Tags, "DesktopProvider") {
		addErr("openapi tags must include DesktopProvider")
	}

	expectPath(spec, "/v1alpha1/desktop-provider/observe", "desktopObserve", "DesktopObserveRequest", "DesktopObserveResponse", &errs)
	expectPath(spec, "/v1alpha1/desktop-provider/actuate", "desktopActuate", "DesktopActuateRequest", "DesktopActuateResponse", &errs)
	expectPath(spec, "/v1alpha1/desktop-provider/verify", "desktopVerify", "DesktopVerifyRequest", "DesktopVerifyResponse", &errs)

	expectRequired(spec, "DesktopStepEnvelope", []string{
		"runId",
		"stepId",
		"targetOS",
		"targetExecutionProfile",
		"requestedCapabilities",
		"verifierPolicy",
	}, &errs)
	expectRequired(spec, "DesktopVerifierPolicy", []string{"requiredVerifierIds"}, &errs)
	expectRequired(spec, "DesktopEvidenceBundle", []string{"windowMetadata", "screenshotHash", "resultCode"}, &errs)
	expectRequired(spec, "DesktopObserveRequest", []string{"meta", "step", "observer"}, &errs)
	expectRequired(spec, "DesktopActuateRequest", []string{"meta", "step", "action"}, &errs)
	expectRequired(spec, "DesktopVerifyRequest", []string{"meta", "step", "postAction"}, &errs)

	stepSchema, ok := spec.Components.Schemas["DesktopStepEnvelope"]
	if !ok {
		addErr("missing schema DesktopStepEnvelope")
	} else {
		targetOS, ok := stepSchema.Properties["targetOS"]
		if !ok {
			addErr("DesktopStepEnvelope missing property targetOS")
		} else {
			requireEnumValues(targetOS.Enum, []string{"linux", "windows", "macos"}, "DesktopStepEnvelope.targetOS", &errs)
		}

		targetProfile, ok := stepSchema.Properties["targetExecutionProfile"]
		if !ok {
			addErr("DesktopStepEnvelope missing property targetExecutionProfile")
		} else {
			requireEnumValues(targetProfile.Enum, []string{"sandbox_vm_autonomous", "restricted_host"}, "DesktopStepEnvelope.targetExecutionProfile", &errs)
		}
	}

	capsSchema, ok := spec.Components.Schemas["ProviderCapabilitiesResponse"]
	if !ok {
		addErr("missing schema ProviderCapabilitiesResponse")
	} else {
		pt, ok := capsSchema.Properties["providerType"]
		if !ok {
			addErr("ProviderCapabilitiesResponse missing property providerType")
		} else if !contains(pt.Enum, "DesktopProvider") {
			addErr("ProviderCapabilitiesResponse.providerType enum must include DesktopProvider")
		}
	}

	return errs
}

func expectPath(spec *openAPISpec, path, operationID, reqSchema, respSchema string, errs *[]string) {
	addErr := func(format string, args ...any) {
		*errs = append(*errs, fmt.Sprintf(format, args...))
	}
	item, ok := spec.Paths[path]
	if !ok {
		addErr("missing path %s", path)
		return
	}
	if item.Post == nil {
		addErr("path %s missing post operation", path)
		return
	}
	if item.Post.OperationID != operationID {
		addErr("path %s operationId=%q expected %q", path, item.Post.OperationID, operationID)
	}
	if item.Post.RequestBody == nil || !item.Post.RequestBody.Required {
		addErr("path %s requestBody.required must be true", path)
	} else {
		mt, ok := item.Post.RequestBody.Content["application/json"]
		if !ok {
			addErr("path %s requestBody missing application/json content", path)
		} else if schemaName(mt.Schema.Ref) != reqSchema {
			addErr("path %s request schema=%q expected %q", path, schemaName(mt.Schema.Ref), reqSchema)
		}
	}
	resp, ok := item.Post.Responses["200"]
	if !ok {
		addErr("path %s missing 200 response", path)
		return
	}
	mt, ok := resp.Content["application/json"]
	if !ok {
		addErr("path %s response 200 missing application/json content", path)
		return
	}
	if schemaName(mt.Schema.Ref) != respSchema {
		addErr("path %s response schema=%q expected %q", path, schemaName(mt.Schema.Ref), respSchema)
	}
}

func expectRequired(spec *openAPISpec, schemaName string, required []string, errs *[]string) {
	schema, ok := spec.Components.Schemas[schemaName]
	if !ok {
		*errs = append(*errs, fmt.Sprintf("missing schema %s", schemaName))
		return
	}
	missing := missingRequired(schema.Required, required)
	if len(missing) > 0 {
		*errs = append(*errs, fmt.Sprintf("schema %s missing required fields: %s", schemaName, strings.Join(missing, ", ")))
	}
}

func validateCRD(crd *extensionProviderCRD) []string {
	var errs []string
	addErr := func(format string, args ...any) {
		errs = append(errs, fmt.Sprintf(format, args...))
	}

	if len(crd.Spec.Versions) == 0 {
		addErr("CRD has no versions")
		return errs
	}
	var v1 *crdNode
	for _, version := range crd.Spec.Versions {
		if version.Name == "v1alpha1" {
			node := version.Schema.OpenAPIV3Schema
			v1 = &node
			break
		}
	}
	if v1 == nil {
		addErr("CRD missing v1alpha1 version")
		return errs
	}
	specNode, ok := v1.Properties["spec"]
	if !ok {
		addErr("CRD v1alpha1 missing schema.properties.spec")
		return errs
	}
	providerTypeNode, ok := specNode.Properties["providerType"]
	if !ok {
		addErr("CRD v1alpha1 missing spec.properties.providerType")
		return errs
	}
	if !contains(providerTypeNode.Enum, "DesktopProvider") {
		addErr("CRD providerType enum must include DesktopProvider")
	}
	return errs
}

func validateFixtures(fixtures []desktopFixture) []string {
	var errs []string
	addErr := func(format string, args ...any) {
		errs = append(errs, fmt.Sprintf(format, args...))
	}

	requiredCases := map[string]struct{}{
		"observe-no-policy":      {},
		"actuate-no-action":      {},
		"actuate-policy-deny":    {},
		"verify-allow-evidence":  {},
		"observe-allow-contract": {},
	}
	seen := map[string]struct{}{}

	for idx, fx := range fixtures {
		scope := fmt.Sprintf("fixture[%d] caseId=%q", idx, fx.CaseID)
		caseID := strings.TrimSpace(fx.CaseID)
		if caseID == "" {
			addErr("%s missing caseId", scope)
			continue
		}
		if _, ok := seen[caseID]; ok {
			addErr("%s duplicate caseId", scope)
		}
		seen[caseID] = struct{}{}

		op := strings.ToLower(strings.TrimSpace(fx.Operation))
		if op != "observe" && op != "actuate" && op != "verify" {
			addErr("%s operation=%q is invalid", scope, fx.Operation)
			continue
		}

		got := evaluateFixture(fx)
		if normalizeToken(fx.Expected.Decision) != normalizeToken(got.Decision) {
			addErr("%s expected decision=%q got=%q", scope, fx.Expected.Decision, got.Decision)
		}
		if normalizeToken(fx.Expected.ReasonCode) != normalizeToken(got.ReasonCode) {
			addErr("%s expected reasonCode=%q got=%q", scope, fx.Expected.ReasonCode, got.ReasonCode)
		}
		if normalizeToken(fx.Expected.VerifierID) != normalizeToken(got.VerifierID) {
			addErr("%s expected verifierId=%q got=%q", scope, fx.Expected.VerifierID, got.VerifierID)
		}
	}

	for caseID := range requiredCases {
		if _, ok := seen[caseID]; !ok {
			addErr("missing required fixture caseId=%q", caseID)
		}
	}

	return errs
}

func evaluateFixture(fx desktopFixture) desktopFixtureExpected {
	if len(fx.Request.RequestedCapabilities) == 0 || !fx.Request.ActionRequested {
		return desktopFixtureExpected{
			Decision:   "DENY",
			ReasonCode: "no_action",
			VerifierID: "V-M13-LNX-002",
		}
	}
	if strings.TrimSpace(fx.Request.PolicyDecision) == "" {
		return desktopFixtureExpected{
			Decision:   "DENY",
			ReasonCode: "no_policy",
			VerifierID: "V-M13-LNX-002",
		}
	}
	if strings.EqualFold(strings.TrimSpace(fx.Request.PolicyDecision), "DENY") {
		return desktopFixtureExpected{
			Decision:   "DENY",
			ReasonCode: "policy_deny",
			VerifierID: "V-M13-LNX-002",
		}
	}
	if strings.EqualFold(strings.TrimSpace(fx.Operation), "verify") {
		if !evidenceComplete(fx.Request.EvidenceBundle) {
			return desktopFixtureExpected{
				Decision:   "DENY",
				ReasonCode: "ambiguous_state",
				VerifierID: "V-M13-LNX-003",
			}
		}
		return desktopFixtureExpected{
			Decision:   "ALLOW",
			ReasonCode: "ok",
			VerifierID: "V-M13-LNX-003",
		}
	}
	return desktopFixtureExpected{
		Decision:   "ALLOW",
		ReasonCode: "ok",
		VerifierID: "V-M13-LNX-001",
	}
}

func evidenceComplete(bundle *desktopEvidence) bool {
	if bundle == nil {
		return false
	}
	if len(bundle.WindowMetadata) == 0 {
		return false
	}
	if strings.TrimSpace(bundle.ScreenshotHash) == "" {
		return false
	}
	if strings.TrimSpace(bundle.ResultCode) == "" {
		return false
	}
	return true
}

func hasTag(tags []openAPITag, want string) bool {
	for _, t := range tags {
		if t.Name == want {
			return true
		}
	}
	return false
}

func missingRequired(have []string, want []string) []string {
	haveSet := make(map[string]struct{}, len(have))
	for _, s := range have {
		haveSet[s] = struct{}{}
	}
	var missing []string
	for _, s := range want {
		if _, ok := haveSet[s]; !ok {
			missing = append(missing, s)
		}
	}
	return missing
}

func requireEnumValues(enum []string, required []string, field string, errs *[]string) {
	for _, v := range required {
		if !contains(enum, v) {
			*errs = append(*errs, fmt.Sprintf("%s enum missing %q", field, v))
		}
	}
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func schemaName(ref string) string {
	const prefix = "#/components/schemas/"
	return strings.TrimPrefix(ref, prefix)
}

func normalizeToken(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func absFromRoot(rootAbs, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(rootAbs, path)
}
