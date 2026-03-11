package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type codexProcessRequest struct {
	CLIPath           string
	HomeDir           string
	Prompt            string
	SystemPrompt      string
	Model             string
	Workdir           string
	SandboxMode       string
	Timeout           time.Duration
	Boundary          *managedWorkerProviderBoundary
	GovernanceContext JSONObject
}

type codexStructuredProposal struct {
	Type                     string   `json:"type"`
	Summary                  string   `json:"summary"`
	Command                  string   `json:"command"`
	Stdin                    string   `json:"stdin"`
	CWD                      string   `json:"cwd"`
	TimeoutSeconds           int      `json:"timeoutSeconds"`
	ReadOnlyRequested        bool     `json:"readOnlyRequested"`
	Confidence               string   `json:"confidence"`
	RequestLabel             string   `json:"requestLabel,omitempty"`
	RequestSummary           string   `json:"requestSummary,omitempty"`
	DemoProfile              string   `json:"demoProfile,omitempty"`
	SubjectType              string   `json:"subjectType,omitempty"`
	SubjectID                string   `json:"subjectId,omitempty"`
	ApprovedForProd          bool     `json:"approvedForProd,omitempty"`
	Environment              string   `json:"environment,omitempty"`
	ActionType               string   `json:"actionType,omitempty"`
	ActionClass              string   `json:"actionClass,omitempty"`
	ActionVerb               string   `json:"actionVerb,omitempty"`
	ActionTarget             string   `json:"actionTarget,omitempty"`
	ResourceKind             string   `json:"resourceKind,omitempty"`
	ResourceNamespace        string   `json:"resourceNamespace,omitempty"`
	ResourceName             string   `json:"resourceName,omitempty"`
	ResourceID               string   `json:"resourceId,omitempty"`
	BoundaryClass            string   `json:"boundaryClass,omitempty"`
	RiskTier                 string   `json:"riskTier,omitempty"`
	RequiredGrants           []string `json:"requiredGrants,omitempty"`
	EvidenceReadiness        string   `json:"evidenceReadiness,omitempty"`
	HandshakeRequired        bool     `json:"handshakeRequired,omitempty"`
	OperatorApprovalRequired bool     `json:"operatorApprovalRequired,omitempty"`
	DryRun                   bool     `json:"dryRun,omitempty"`
	PolicyBucketID           string   `json:"policyBucketId,omitempty"`
	WorkflowKind             string   `json:"workflowKind,omitempty"`
	FinanceOrder             *struct {
		Symbol   string `json:"symbol,omitempty"`
		Side     string `json:"side,omitempty"`
		Quantity int    `json:"quantity,omitempty"`
		Account  string `json:"account,omitempty"`
	} `json:"financeOrder,omitempty"`
}

type codexStructuredTurn struct {
	Message       string                    `json:"message"`
	ToolProposals []codexStructuredProposal `json:"tool_proposals"`
}

type codexProcessEvent struct {
	Type  string          `json:"type"`
	Item  json.RawMessage `json:"item,omitempty"`
	Usage JSONObject      `json:"usage,omitempty"`
	Error JSONObject      `json:"error,omitempty"`
}

type codexProcessItem struct {
	ID               string `json:"id,omitempty"`
	Type             string `json:"type,omitempty"`
	Text             string `json:"text,omitempty"`
	Command          string `json:"command,omitempty"`
	AggregatedOutput string `json:"aggregated_output,omitempty"`
	ExitCode         *int   `json:"exit_code,omitempty"`
	Status           string `json:"status,omitempty"`
}

var (
	codexPrintfRedirectPattern = regexp.MustCompile(`^printf\s+('(?:[^']|\\')*'|"(?:[^"\\]|\\.)*")\s*>\s*([^\s]+)$`)
	codexPrintfTeePattern      = regexp.MustCompile(`^printf\s+('(?:[^']|\\')*'|"(?:[^"\\]|\\.)*")\s*\|\s*tee\s+([^\s]+)$`)
	codexPythonWritePattern    = regexp.MustCompile(`^python3\s+-c\s+(".*"|'[^']*')$`)
)

func (a codexManagedWorkerAdapter) runCodexProcessTurn(ctx context.Context, req AgentInvokeRequest, profile agentProfileConfig, boundary *managedWorkerProviderBoundary) (*managedWorkerTurnResult, error) {
	workdir := strings.TrimSpace(a.workdir)
	if workdir == "" {
		if cwd, err := os.Getwd(); err == nil {
			workdir = cwd
		}
	}
	processReq := codexProcessRequest{
		CLIPath:           strings.TrimSpace(a.cliPath),
		HomeDir:           strings.TrimSpace(a.homeDir),
		Prompt:            strings.TrimSpace(req.Prompt),
		SystemPrompt:      strings.TrimSpace(req.SystemPrompt),
		Model:             strings.TrimSpace(profile.Model),
		Workdir:           workdir,
		SandboxMode:       strings.TrimSpace(a.sandboxMode),
		Timeout:           a.timeout,
		Boundary:          boundary,
		GovernanceContext: req.GovernanceContext,
	}
	run := a.runProcess
	if run == nil {
		run = runCodexProcess
	}
	transcript, err := run(ctx, processReq)
	if err != nil {
		return nil, err
	}
	return parseCodexProcessTranscript(transcript)
}

func runCodexProcess(parent context.Context, req codexProcessRequest) ([]byte, error) {
	if parent == nil {
		parent = context.Background()
	}
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	schemaPath, err := writeCodexOutputSchema()
	if err != nil {
		return nil, fmt.Errorf("write codex output schema: %w", err)
	}
	defer os.Remove(schemaPath)

	cliPath := resolveCodexCLIPath(req.CLIPath)
	args := []string{
		"exec",
		"--json",
		"--ephemeral",
		"--skip-git-repo-check",
		"-c", "analytics.enabled=false",
		"-s", normalizeCodexSandboxMode(req.SandboxMode),
	}
	env := os.Environ()
	if req.Boundary != nil {
		for _, item := range buildCodexBoundaryConfigArgs(req.Boundary) {
			args = append(args, "-c", item)
		}
		if envVar := strings.TrimSpace(req.Boundary.TokenEnvVar); envVar != "" && strings.TrimSpace(req.Boundary.TokenValue) != "" {
			env = append(env, envVar+"="+req.Boundary.TokenValue)
		}
		if token := strings.TrimSpace(req.Boundary.TokenValue); token != "" {
			env = append(env, "OPENAI_API_KEY="+token)
		}
	}
	if homeDir := strings.TrimSpace(req.HomeDir); homeDir != "" {
		env = append(env, "CODEX_HOME="+homeDir)
	}
	if strings.TrimSpace(req.Workdir) != "" {
		args = append(args, "-C", strings.TrimSpace(req.Workdir))
	}
	if strings.TrimSpace(req.Model) != "" {
		args = append(args, "-m", strings.TrimSpace(req.Model))
	}
	args = append(args, "--output-schema", schemaPath, buildManagedCodexPrompt(req))

	cmd := exec.CommandContext(ctx, cliPath, args...)
	cmd.Env = env
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		combined := strings.TrimSpace(strings.Join([]string{stdout.String(), stderr.String()}, "\n"))
		if combined == "" {
			combined = err.Error()
		}
		return nil, fmt.Errorf("codex exec failed: %s", combined)
	}
	if stderr.Len() == 0 {
		return stdout.Bytes(), nil
	}
	joined := stdout.String()
	if strings.TrimSpace(joined) != "" {
		joined += "\n"
	}
	joined += stderr.String()
	return []byte(joined), nil
}

func buildCodexBoundaryConfigArgs(boundary *managedWorkerProviderBoundary) []string {
	if boundary == nil {
		return nil
	}
	providerID := normalizeStringOrDefault(boundary.ProviderID, "agentops_gateway")
	items := []string{
		`forced_login_method="api"`,
		`model_reasoning_effort="high"`,
		`plan_mode_reasoning_effort="high"`,
		fmt.Sprintf("model_provider=%q", providerID),
		fmt.Sprintf("model_providers.%s.name=%q", providerID, normalizeStringOrDefault(boundary.ProviderName, "AgentOps Gateway")),
		fmt.Sprintf("model_providers.%s.base_url=%q", providerID, strings.TrimSpace(boundary.BaseURL)),
		fmt.Sprintf("model_providers.%s.wire_api=%q", providerID, normalizeStringOrDefault(boundary.WireAPI, "responses")),
		fmt.Sprintf("model_providers.%s.env_key=%q", providerID, "OPENAI_API_KEY"),
	}
	if envVar := strings.TrimSpace(boundary.TokenEnvVar); envVar != "" {
		items = append(items, fmt.Sprintf("model_providers.%s.bearer_token_env_var=%q", providerID, envVar))
	}
	return items
}

func buildManagedCodexProviderBoundary(route *invokeRoute) (*managedWorkerProviderBoundary, error) {
	if route == nil {
		return nil, fmt.Errorf("managed worker boundary route is required")
	}
	if strings.TrimSpace(route.profile.Transport) != "responses_api" {
		return nil, fmt.Errorf("managed Codex process boundary requires responses_api transport, got %q", route.profile.Transport)
	}
	baseURL, err := appendRequestPath(route.endpoint, "/v1")
	if err != nil {
		return nil, fmt.Errorf("build managed Codex boundary URL: %w", err)
	}
	boundary := &managedWorkerProviderBoundary{
		RouteName:     managedWorkerProcessRouteName(route),
		ProviderID:    "agentops_gateway",
		ProviderName:  "AgentOps Gateway",
		BaseURL:       baseURL,
		WireAPI:       "responses",
		EndpointRef:   strings.TrimSpace(route.endpointRef),
		CredentialRef: strings.TrimSpace(route.credentialRef),
	}
	if route.authMode == "bearer" && strings.TrimSpace(route.authValue) != "" {
		boundary.TokenEnvVar = "AGENTOPS_CODEX_GATEWAY_TOKEN"
		boundary.TokenValue = strings.TrimSpace(route.authValue)
	}
	return boundary, nil
}

func managedWorkerProcessRouteName(route *invokeRoute) string {
	if route == nil {
		return "managed_worker_process"
	}
	switch strings.TrimSpace(strings.ToLower(route.name)) {
	case "gateway":
		return "managed_worker_gateway_process"
	case "direct":
		return "managed_worker_provider_process"
	default:
		return "managed_worker_process"
	}
}

func resolveCodexCLIPath(configured string) string {
	if trimmed := strings.TrimSpace(configured); trimmed != "" {
		return trimmed
	}
	if path, err := exec.LookPath("codex"); err == nil {
		return path
	}
	return "/Applications/Codex.app/Contents/Resources/codex"
}

func normalizeCodexSandboxMode(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "workspace-write":
		return "workspace-write"
	case "danger-full-access":
		return "danger-full-access"
	default:
		return "read-only"
	}
}

func writeCodexOutputSchema() (string, error) {
	file, err := os.CreateTemp("", "agentops-codex-output-schema-*.json")
	if err != nil {
		return "", err
	}
	defer file.Close()
	financeOrderProperties := map[string]interface{}{
		"symbol":   codexSchemaNullableType("string"),
		"side":     codexSchemaNullableType("string"),
		"quantity": codexSchemaNullableType("integer"),
		"account":  codexSchemaNullableType("string"),
	}
	toolProposalProperties := map[string]interface{}{
		"type": map[string]interface{}{
			"type": "string",
			"enum": []string{"terminal_command", governedActionProposalType},
		},
		"summary":           map[string]interface{}{"type": "string"},
		"command":           codexSchemaNullableType("string"),
		"stdin":             codexSchemaNullableType("string"),
		"cwd":               codexSchemaNullableType("string"),
		"timeoutSeconds":    codexSchemaNullableType("integer"),
		"readOnlyRequested": codexSchemaNullableType("boolean"),
		"confidence":        map[string]interface{}{"type": "string"},
		"requestLabel":      codexSchemaNullableType("string"),
		"requestSummary":    codexSchemaNullableType("string"),
		"demoProfile":       codexSchemaNullableType("string"),
		"subjectType":       codexSchemaNullableType("string"),
		"subjectId":         codexSchemaNullableType("string"),
		"approvedForProd":   codexSchemaNullableType("boolean"),
		"environment":       codexSchemaNullableType("string"),
		"actionType":        codexSchemaNullableType("string"),
		"actionClass":       codexSchemaNullableType("string"),
		"actionVerb":        codexSchemaNullableType("string"),
		"actionTarget":      codexSchemaNullableType("string"),
		"resourceKind":      codexSchemaNullableType("string"),
		"resourceNamespace": codexSchemaNullableType("string"),
		"resourceName":      codexSchemaNullableType("string"),
		"resourceId":        codexSchemaNullableType("string"),
		"boundaryClass":     codexSchemaNullableType("string"),
		"riskTier":          codexSchemaNullableType("string"),
		"requiredGrants": map[string]interface{}{
			"type":  []string{"array", "null"},
			"items": map[string]interface{}{"type": "string"},
		},
		"evidenceReadiness":        codexSchemaNullableType("string"),
		"handshakeRequired":        codexSchemaNullableType("boolean"),
		"operatorApprovalRequired": codexSchemaNullableType("boolean"),
		"dryRun":                   codexSchemaNullableType("boolean"),
		"policyBucketId":           codexSchemaNullableType("string"),
		"workflowKind":             codexSchemaNullableType("string"),
		"financeOrder": map[string]interface{}{
			"type":                 []string{"object", "null"},
			"properties":           financeOrderProperties,
			"required":             codexSchemaRequiredKeys(financeOrderProperties),
			"additionalProperties": false,
		},
	}
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"message": map[string]interface{}{"type": "string"},
			"tool_proposals": map[string]interface{}{
				"type": "array",
				"items": map[string]interface{}{
					"type":                 "object",
					"properties":           toolProposalProperties,
					"required":             codexSchemaRequiredKeys(toolProposalProperties),
					"additionalProperties": false,
				},
			},
		},
		"required":             []string{"message", "tool_proposals"},
		"additionalProperties": false,
	}
	encoded, err := json.Marshal(schema)
	if err != nil {
		return "", err
	}
	if _, err := file.Write(encoded); err != nil {
		return "", err
	}
	return file.Name(), nil
}

func codexSchemaNullableType(baseType string) map[string]interface{} {
	return map[string]interface{}{
		"type": []string{baseType, "null"},
	}
}

func codexSchemaRequiredKeys(properties map[string]interface{}) []string {
	keys := make([]string, 0, len(properties))
	for key := range properties {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func buildManagedCodexPrompt(req codexProcessRequest) string {
	sections := make([]string, 0, 3)
	if strings.TrimSpace(req.SystemPrompt) != "" {
		sections = append(sections, "System instructions:\n"+strings.TrimSpace(req.SystemPrompt))
	}
	sections = append(sections, strings.Join([]string{
		"You are the managed Codex worker running under AgentOps.",
		"Return final operator-facing text in the `message` field.",
		"Use `tool_proposals` for governed actions that should be evaluated through the runtime policy boundary before execution.",
		"Two governed proposal types are allowed: `terminal_command` and `governed_action_request`.",
		"Never execute mutating or environment-changing commands directly.",
		"If the operator request describes a real-world external action, API actuation, broker action, robot action, browser action, compliance review request, eligibility report request, or other governed target, return a `governed_action_request` proposal instead of a shell command.",
		"For benign informational governance requests such as compliance reports, conflict checks, eligibility reviews, or advisory asks, use `demoProfile=compliance_report`, `workflowKind=advisory_request`, `actionType=compliance.report.request`, `actionClass=read`, `actionVerb=request`, `actionTarget=compliance-review`, `resourceKind=compliance-report`, `boundaryClass=model_gateway`, `riskTier=low`, `requiredGrants=[]`, `evidenceReadiness=READY`, `handshakeRequired=true`, and `operatorApprovalRequired=false` unless the operator explicitly asks for manual preclearance.",
		"For low-risk allow-shaped finance requests, use `demoProfile=finance_paper_trade`, `environment=dev`, `actionType=trade.execute`, `boundaryClass=external_actuator`, `riskTier=low`, `requiredGrants=[]`, `evidenceReadiness=READY`, `handshakeRequired=true`, and `operatorApprovalRequired=false` unless the operator explicitly asks for manual preclearance.",
		"For high-risk defer-shaped finance requests, use `demoProfile=finance_paper_trade`, `environment=dev`, `actionType=trade.execute`, `boundaryClass=external_actuator`, `riskTier=high`, `requiredGrants=[\"grant.trading.supervisor\"]`, `evidenceReadiness=PARTIAL`, `handshakeRequired=true`, and `operatorApprovalRequired=false` unless the operator explicitly asks for manual preclearance.",
		"For clear deny-shaped requests, use standard request fields instead of hidden test markers. Prefer destructive verbs like `delete` plus `environment=prod` and `approvedForProd=false` when the operator intent is an unapproved production-destructive action.",
		"Populate `governed_action_request` with requestLabel, requestSummary, actionType, actionClass, actionVerb, actionTarget, resourceKind, resourceNamespace, resourceName, resourceId, boundaryClass, riskTier, requiredGrants, evidenceReadiness, handshakeRequired, environment, workflowKind, operatorApprovalRequired, and financeOrder when relevant.",
		"If the operator request requires creating or modifying a file, express that work as a governed `tool_proposals` terminal command using `command` = `tee <target>` and `stdin` = the exact file contents.",
		"If the operator request requires deleting a file, express that work as a governed `tool_proposals` terminal command using `command` = `rm <target>`.",
		"If the operator request requires reading a file, prefer `command` = `cat <target>` with `readOnlyRequested=true`.",
		"Read-only inspection commands should set `readOnlyRequested=true`; mutating commands that require approval should set `readOnlyRequested=false`.",
		"Do not use shell redirection, pipes, heredocs, interpreter wrappers, or shell control operators in governed terminal proposals.",
		"Do not answer with only a sandbox refusal when the request can be satisfied by returning a governed proposal.",
		"Each `terminal_command` proposal must include command, stdin, cwd, timeoutSeconds, readOnlyRequested, and confidence.",
		"Each `governed_action_request` proposal must include requestLabel, requestSummary, actionType, actionTarget, resourceKind, resourceName, riskTier, requiredGrants, evidenceReadiness, environment, operatorApprovalRequired, and confidence.",
		"For fields that do not apply to the chosen proposal type, return `null` instead of omitting the field.",
		"If a command does not need input content, set `stdin` to the empty string.",
		"If no tool proposal is needed, return an empty `tool_proposals` array.",
	}, "\n"))
	if governanceOverlay := buildManagedCodexGovernanceOverlaySection(req); governanceOverlay != "" {
		sections = append(sections, governanceOverlay)
	}
	sections = append(sections, "Operator request:\n"+strings.TrimSpace(req.Prompt))
	return strings.Join(sections, "\n\n")
}

func buildManagedCodexGovernanceOverlaySection(req codexProcessRequest) string {
	governance := req.GovernanceContext
	if len(governance) == 0 {
		return ""
	}
	lines := []string{
		"Active local demo governance overlay:",
		"This overlay comes from Desktop Settings and is system-owned local demo configuration, not operator prompt text.",
	}
	persona := extractJSONObjectValue(governance["persona"])
	if normalizedInterfaceBool(persona["enabled"]) {
		lines = append(lines,
			fmt.Sprintf("Use demo persona subjectId=%q when shaping governed requests.", normalizedInterfaceString(persona["subjectId"])),
			fmt.Sprintf("Use demo persona clientId=%q as local authority context.", normalizedInterfaceString(persona["clientId"])),
			fmt.Sprintf("Use demo persona roles=%v as local authority context.", normalizeGovernedActionStringSlice(persona["roles"])),
			fmt.Sprintf("Use demo persona approvedForProd=%t unless the operator explicitly asks for a different governed posture.", normalizedInterfaceBool(persona["approvedForProd"])),
		)
	}
	policy := extractJSONObjectValue(governance["policy"])
	if normalizedInterfaceBool(policy["enabled"]) {
		reviewMode := normalizeStringOrDefault(normalizedInterfaceString(policy["reviewMode"]), "policy_first")
		lines = append(lines,
			fmt.Sprintf("Set operatorApprovalRequired=%t by default because local demo reviewMode=%s.", reviewMode == "manual_review", reviewMode),
			fmt.Sprintf("Set handshakeRequired=%t by default because the local demo policy overlay requires it.", !payloadHasExplicitFalse(policy["handshakeRequired"])),
		)
		if normalizedInterfaceBool(policy["advisoryAutoShape"]) {
			lines = append(lines, "Benign advisory or compliance asks should be modeled as compliance.report.request advisory_request proposals instead of execution actions.")
		}
		if normalizedInterfaceBool(policy["financeSupervisorGrant"]) {
			lines = append(lines, fmt.Sprintf("High-risk finance paper trades should require grant.trading.supervisor and evidenceReadiness=%s.", normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(policy["financeEvidenceReadiness"]))))
		}
		if normalizedInterfaceBool(policy["productionDeleteDeny"]) {
			lines = append(lines, "Production-destructive requests should stay deny-shaped: use environment=prod, destructive verbs like delete, and approvedForProd=false.")
		}
		if prefix := strings.TrimSpace(normalizedInterfaceString(policy["policyBucketPrefix"])); prefix != "" {
			lines = append(lines, fmt.Sprintf("Use policy bucket prefix %q for governed demo requests when you need a policyBucketId.", prefix))
		}
	}
	if len(lines) == 2 {
		return ""
	}
	return strings.Join(lines, "\n")
}

func buildManagedCodexContinuationPrompt(req managedWorkerContinuationRequest) string {
	sections := make([]string, 0, 8)
	if strings.TrimSpace(req.SystemPrompt) != "" {
		sections = append(sections, "System instructions:\n"+strings.TrimSpace(req.SystemPrompt))
	}
	sections = append(sections, strings.Join([]string{
		"You are continuing the same managed Codex worker session under AgentOps after a governed tool action.",
		"Use the governed tool execution result below to continue the session from the current state.",
		"Return final operator-facing text in the `message` field.",
		"Use `tool_proposals` only if another governed tool step is strictly required.",
		"Never execute mutating or environment-changing commands directly.",
		"If the next step is a real-world external action or a governed informational request such as a compliance report or advisory review, return a `governed_action_request` proposal instead of a shell command.",
		"If another file creation or modification step is required, return it as a governed `tool_proposals` terminal command using `command` = `tee <target>` and `stdin` = the exact file contents.",
		"If another file deletion step is required, return it as a governed `tool_proposals` terminal command using `command` = `rm <target>`.",
		"If another file read step is required, prefer `command` = `cat <target>` with `readOnlyRequested=true`.",
		"Each `terminal_command` proposal must include `stdin`; use the empty string when the command does not need input content.",
		"Each `governed_action_request` proposal must include requestLabel, requestSummary, actionType, actionTarget, resourceKind, resourceName, riskTier, requiredGrants, evidenceReadiness, environment, operatorApprovalRequired, and confidence.",
		"For fields that do not apply to the chosen proposal type, return `null` instead of omitting the field.",
		"Do not use shell redirection, pipes, heredocs, interpreter wrappers, or shell control operators in governed terminal proposals.",
	}, "\n"))
	if req.Task != nil && strings.TrimSpace(req.Task.Intent) != "" {
		sections = append(sections, "Original task intent:\n"+strings.TrimSpace(req.Task.Intent))
	}
	if strings.TrimSpace(req.PreviousOutputText) != "" {
		sections = append(sections, "Previous managed worker output:\n"+truncateManagedCodexContinuationText(req.PreviousOutputText, 1600))
	}
	if req.Proposal != nil {
		details := []string{
			fmt.Sprintf("- proposalId: %s", strings.TrimSpace(req.Proposal.ProposalID)),
			fmt.Sprintf("- proposalType: %s", strings.TrimSpace(req.Proposal.ProposalType)),
			fmt.Sprintf("- summary: %s", strings.TrimSpace(req.Proposal.Summary)),
		}
		if strings.EqualFold(strings.TrimSpace(req.Proposal.ProposalType), governedActionProposalType) {
			details = append(details,
				fmt.Sprintf("- requestLabel: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "requestLabel"))),
				fmt.Sprintf("- requestSummary: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "requestSummary"))),
				fmt.Sprintf("- actionType: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "actionType"))),
				fmt.Sprintf("- resourceKind: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "resourceKind"))),
				fmt.Sprintf("- resourceName: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "resourceName"))),
				fmt.Sprintf("- riskTier: %s", normalizedInterfaceString(proposalPayloadValue(req.Proposal, "riskTier"))),
			)
		} else {
			details = append(details, fmt.Sprintf("- command: %s", strings.TrimSpace(req.CommandText)))
			if strings.TrimSpace(req.CommandCWD) != "" {
				details = append(details, fmt.Sprintf("- cwd: %s", strings.TrimSpace(req.CommandCWD)))
			}
			if req.TimeoutSeconds > 0 {
				details = append(details, fmt.Sprintf("- timeoutSeconds: %d", req.TimeoutSeconds))
			}
		}
		sections = append(sections, "Approved governed proposal:\n"+strings.Join(details, "\n"))
	}
	toolActionStatus := "UNKNOWN"
	if req.ToolAction != nil {
		toolActionStatus = normalizeStringOrDefault(string(req.ToolAction.Status), "UNKNOWN")
	}
	proposalType := ""
	if req.Proposal != nil {
		proposalType = normalizeStringOrDefault(req.Proposal.ProposalType, "")
	}
	resultLines := []string{
		fmt.Sprintf("- status: %s", toolActionStatus),
	}
	if strings.EqualFold(proposalType, governedActionProposalType) {
		if req.GovernedRun != nil {
			resultLines = append(resultLines,
				fmt.Sprintf("- runId: %s", strings.TrimSpace(req.GovernedRun.RunID)),
				fmt.Sprintf("- runStatus: %s", strings.TrimSpace(string(req.GovernedRun.Status))),
				fmt.Sprintf("- policyDecision: %s", strings.TrimSpace(req.GovernedRun.PolicyDecision)),
				fmt.Sprintf("- selectedPolicyProvider: %s", strings.TrimSpace(req.GovernedRun.SelectedPolicyProvider)),
				fmt.Sprintf("- grantTokenPresent: %t", req.GovernedRun.PolicyGrantTokenPresent),
			)
			if strings.TrimSpace(req.GovernedRun.ErrorMessage) != "" {
				resultLines = append(resultLines, fmt.Sprintf("- error: %s", strings.TrimSpace(req.GovernedRun.ErrorMessage)))
			}
			if policyResponse := strings.TrimSpace(string(req.GovernedRun.PolicyResponse)); policyResponse != "" {
				resultLines = append(resultLines, "- policyResponse:\n"+truncateManagedCodexContinuationText(policyResponse, 2400))
			}
		}
	} else if req.ExecutionResult != nil {
		resultLines = append(resultLines,
			fmt.Sprintf("- exitCode: %d", req.ExecutionResult.ExitCode),
			fmt.Sprintf("- timedOut: %t", req.ExecutionResult.TimedOut),
			fmt.Sprintf("- outputTruncated: %t", req.ExecutionResult.Truncated),
		)
		if strings.TrimSpace(req.ExecutionResult.Output) != "" {
			resultLines = append(resultLines, "- output:\n"+truncateManagedCodexContinuationText(req.ExecutionResult.Output, 2400))
		}
	}
	if strings.TrimSpace(req.ExecutionError) != "" {
		resultLines = append(resultLines, fmt.Sprintf("- error: %s", strings.TrimSpace(req.ExecutionError)))
	}
	sections = append(sections, "Governed tool execution result:\n"+strings.Join(resultLines, "\n"))
	sections = append(sections, strings.Join([]string{
		"Continue the session from this point.",
		"If no further governed tool step is required, provide the final operator-facing answer.",
		"If another governed tool step is required, return the minimum necessary next `tool_proposals`.",
	}, "\n"))
	return strings.Join(sections, "\n\n")
}

func buildManagedCodexLegacyContinuationSummary(req managedWorkerContinuationRequest) string {
	summary := "Managed Codex reviewed the governed tool result and is ready for the next operator turn."
	if req.ExecutionResult == nil {
		if strings.TrimSpace(req.ExecutionError) != "" {
			return fmt.Sprintf("Managed Codex reviewed the governed tool failure: %s", strings.TrimSpace(req.ExecutionError))
		}
		return summary
	}
	statusText := "completed"
	if strings.TrimSpace(req.ExecutionError) != "" || (req.ToolAction != nil && req.ToolAction.Status == ToolActionStatusFailed) {
		statusText = "failed"
	}
	base := fmt.Sprintf("Managed Codex reviewed the governed tool result (%s, exitCode=%d).", statusText, req.ExecutionResult.ExitCode)
	if strings.TrimSpace(req.ExecutionResult.Output) == "" {
		return base
	}
	return base + "\n" + truncateManagedCodexContinuationText(req.ExecutionResult.Output, 480)
}

func truncateManagedCodexContinuationText(value string, maxLen int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || maxLen <= 0 || len(trimmed) <= maxLen {
		return trimmed
	}
	return strings.TrimSpace(trimmed[:maxLen-3]) + "..."
}

func parseCodexProcessTranscript(transcript []byte) (*managedWorkerTurnResult, error) {
	lines := strings.Split(strings.ReplaceAll(string(transcript), "\r\n", "\n"), "\n")
	var (
		events           []JSONObject
		messageChunks    []string
		commandSummaries []string
		structured       codexStructuredTurn
		structuredFound  bool
		usage            JSONObject
	)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || !strings.HasPrefix(trimmed, "{") {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
			continue
		}
		events = append(events, JSONObject(raw))
		var event codexProcessEvent
		if err := json.Unmarshal([]byte(trimmed), &event); err != nil {
			continue
		}
		switch strings.TrimSpace(event.Type) {
		case "item.started", "item.completed":
			var item codexProcessItem
			if err := json.Unmarshal(event.Item, &item); err != nil {
				continue
			}
			switch strings.TrimSpace(item.Type) {
			case "agent_message":
				text := strings.TrimSpace(item.Text)
				if text == "" {
					continue
				}
				if parsed, ok := parseStructuredCodexTurn(text); ok {
					structured = parsed
					structuredFound = true
					continue
				}
				messageChunks = append(messageChunks, text)
			case "command_execution":
				if summary := summarizeCodexCommandExecution(item); summary != "" {
					commandSummaries = append(commandSummaries, summary)
				}
			}
		case "turn.completed":
			if len(event.Usage) > 0 {
				usage = event.Usage
			}
		case "error", "turn.failed":
			return nil, fmt.Errorf("codex worker process reported failure: %s", trimmed)
		}
	}
	if !structuredFound {
		return nil, fmt.Errorf("codex worker process did not emit a structured final payload")
	}

	outputText := strings.TrimSpace(structured.Message)
	outputChunks := splitManagedCodexOutput(outputText)
	for _, summary := range commandSummaries {
		if strings.TrimSpace(summary) != "" {
			outputChunks = append(outputChunks, summary)
		}
	}
	if len(outputChunks) == 0 && len(messageChunks) > 0 {
		outputChunks = splitManagedCodexOutput(strings.Join(messageChunks, "\n\n"))
	}
	toolProposals := make([]JSONObject, 0, len(structured.ToolProposals))
	for idx, proposal := range structured.ToolProposals {
		proposal = normalizeCodexStructuredProposal(proposal)
		if err := validateCodexStructuredProposal(proposal); err != nil {
			return nil, fmt.Errorf("codex worker emitted invalid proposal %d: %w", idx+1, err)
		}
		proposalID := fmt.Sprintf("codex-proposal-%d", idx+1)
		proposalPayload := JSONObject{
			"proposalId": proposalID,
		}
		for key, value := range structuredProposalJSONObject(proposal) {
			proposalPayload[key] = value
		}
		toolProposals = append(toolProposals, proposalPayload)
	}
	rawEvents, _ := json.Marshal(events)
	return &managedWorkerTurnResult{
		outputText:         outputText,
		finishReason:       "managed_worker_process",
		usage:              usage,
		rawResponse:        rawEvents,
		workerOutputChunks: outputChunks,
		toolProposals:      toolProposals,
	}, nil
}

func parseStructuredCodexTurn(text string) (codexStructuredTurn, bool) {
	var payload codexStructuredTurn
	if err := json.Unmarshal([]byte(strings.TrimSpace(text)), &payload); err != nil {
		return codexStructuredTurn{}, false
	}
	return payload, true
}

func normalizeCodexStructuredProposal(proposal codexStructuredProposal) codexStructuredProposal {
	proposal.Type = normalizeStringOrDefault(proposal.Type, "terminal_command")
	proposal.Summary = strings.TrimSpace(proposal.Summary)
	proposal.Command = strings.TrimSpace(proposal.Command)
	proposal.CWD = strings.TrimSpace(proposal.CWD)
	proposal.Confidence = normalizeStringOrDefault(proposal.Confidence, "medium")
	if strings.EqualFold(proposal.Type, governedActionProposalType) {
		return normalizeCodexGovernedActionProposal(proposal)
	}
	if !strings.EqualFold(proposal.Type, "terminal_command") {
		return proposal
	}
	if normalized, ok := normalizeCodexFileWriteProposal(proposal); ok {
		return normalized
	}
	return proposal
}

func normalizeCodexGovernedActionProposal(proposal codexStructuredProposal) codexStructuredProposal {
	normalized := normalizeGovernedActionProposalPayload(JSONObject{
		"type":                     governedActionProposalType,
		"summary":                  proposal.Summary,
		"confidence":               proposal.Confidence,
		"requestLabel":             proposal.RequestLabel,
		"requestSummary":           proposal.RequestSummary,
		"demoProfile":              proposal.DemoProfile,
		"subjectType":              proposal.SubjectType,
		"subjectId":                proposal.SubjectID,
		"approvedForProd":          proposal.ApprovedForProd,
		"environment":              proposal.Environment,
		"actionType":               proposal.ActionType,
		"actionClass":              proposal.ActionClass,
		"actionVerb":               proposal.ActionVerb,
		"actionTarget":             proposal.ActionTarget,
		"resourceKind":             proposal.ResourceKind,
		"resourceNamespace":        proposal.ResourceNamespace,
		"resourceName":             proposal.ResourceName,
		"resourceId":               proposal.ResourceID,
		"boundaryClass":            proposal.BoundaryClass,
		"riskTier":                 proposal.RiskTier,
		"requiredGrants":           proposal.RequiredGrants,
		"evidenceReadiness":        proposal.EvidenceReadiness,
		"handshakeRequired":        proposal.HandshakeRequired,
		"operatorApprovalRequired": proposal.OperatorApprovalRequired,
		"dryRun":                   proposal.DryRun,
		"policyBucketId":           proposal.PolicyBucketID,
		"workflowKind":             proposal.WorkflowKind,
		"financeOrder": func() JSONObject {
			if proposal.FinanceOrder == nil {
				return nil
			}
			return JSONObject{
				"symbol":   proposal.FinanceOrder.Symbol,
				"side":     proposal.FinanceOrder.Side,
				"quantity": proposal.FinanceOrder.Quantity,
				"account":  proposal.FinanceOrder.Account,
			}
		}(),
	})
	proposal.Type = governedActionProposalType
	proposal.Summary = normalizedInterfaceString(normalized["summary"])
	proposal.Confidence = normalizedInterfaceString(normalized["confidence"])
	proposal.RequestLabel = normalizedInterfaceString(normalized["requestLabel"])
	proposal.RequestSummary = normalizedInterfaceString(normalized["requestSummary"])
	proposal.DemoProfile = normalizedInterfaceString(normalized["demoProfile"])
	proposal.SubjectType = normalizedInterfaceString(normalized["subjectType"])
	proposal.SubjectID = normalizedInterfaceString(normalized["subjectId"])
	proposal.ApprovedForProd = normalizedInterfaceBool(normalized["approvedForProd"])
	proposal.Environment = normalizedInterfaceString(normalized["environment"])
	proposal.ActionType = normalizedInterfaceString(normalized["actionType"])
	proposal.ActionClass = normalizedInterfaceString(normalized["actionClass"])
	proposal.ActionVerb = normalizedInterfaceString(normalized["actionVerb"])
	proposal.ActionTarget = normalizedInterfaceString(normalized["actionTarget"])
	proposal.ResourceKind = normalizedInterfaceString(normalized["resourceKind"])
	proposal.ResourceNamespace = normalizedInterfaceString(normalized["resourceNamespace"])
	proposal.ResourceName = normalizedInterfaceString(normalized["resourceName"])
	proposal.ResourceID = normalizedInterfaceString(normalized["resourceId"])
	proposal.BoundaryClass = normalizedInterfaceString(normalized["boundaryClass"])
	proposal.RiskTier = normalizedInterfaceString(normalized["riskTier"])
	proposal.RequiredGrants = normalizeGovernedActionStringSlice(normalized["requiredGrants"])
	proposal.EvidenceReadiness = normalizedInterfaceString(normalized["evidenceReadiness"])
	proposal.HandshakeRequired = normalizedInterfaceBool(normalized["handshakeRequired"])
	proposal.OperatorApprovalRequired = normalizedInterfaceBool(normalized["operatorApprovalRequired"])
	proposal.DryRun = normalizedInterfaceBool(normalized["dryRun"])
	proposal.PolicyBucketID = normalizedInterfaceString(normalized["policyBucketId"])
	proposal.WorkflowKind = normalizedInterfaceString(normalized["workflowKind"])
	if financeOrder, ok := normalized["financeOrder"].(JSONObject); ok && len(financeOrder) > 0 {
		proposal.FinanceOrder = &struct {
			Symbol   string `json:"symbol,omitempty"`
			Side     string `json:"side,omitempty"`
			Quantity int    `json:"quantity,omitempty"`
			Account  string `json:"account,omitempty"`
		}{
			Symbol:   normalizedInterfaceString(financeOrder["symbol"]),
			Side:     normalizedInterfaceString(financeOrder["side"]),
			Quantity: normalizedInterfaceInt(financeOrder["quantity"], 25),
			Account:  normalizedInterfaceString(financeOrder["account"]),
		}
	}
	return proposal
}

func validateCodexStructuredProposal(proposal codexStructuredProposal) error {
	proposalType := normalizeStringOrDefault(strings.TrimSpace(proposal.Type), "terminal_command")
	if strings.TrimSpace(proposal.Summary) == "" {
		return fmt.Errorf("%s proposal summary is required", proposalType)
	}
	switch proposalType {
	case "terminal_command":
		if strings.TrimSpace(proposal.Command) == "" {
			return fmt.Errorf("terminal_command proposal command is required")
		}
		return nil
	case governedActionProposalType:
		missing := make([]string, 0, 8)
		for _, field := range []struct {
			name  string
			value string
		}{
			{name: "requestLabel", value: proposal.RequestLabel},
			{name: "requestSummary", value: proposal.RequestSummary},
			{name: "actionType", value: proposal.ActionType},
			{name: "actionTarget", value: proposal.ActionTarget},
			{name: "resourceKind", value: proposal.ResourceKind},
			{name: "resourceName", value: proposal.ResourceName},
			{name: "riskTier", value: proposal.RiskTier},
			{name: "evidenceReadiness", value: proposal.EvidenceReadiness},
			{name: "environment", value: proposal.Environment},
		} {
			if strings.TrimSpace(field.value) == "" {
				missing = append(missing, field.name)
			}
		}
		if len(missing) > 0 {
			return fmt.Errorf("governed_action_request proposal missing required fields: %s", strings.Join(missing, ", "))
		}
		return nil
	default:
		return fmt.Errorf("unsupported proposal type %q", proposalType)
	}
}

func structuredProposalJSONObject(proposal codexStructuredProposal) JSONObject {
	if strings.EqualFold(proposal.Type, governedActionProposalType) {
		payload := JSONObject{
			"type":                     governedActionProposalType,
			"summary":                  strings.TrimSpace(proposal.Summary),
			"confidence":               normalizeStringOrDefault(proposal.Confidence, "structured"),
			"requestLabel":             strings.TrimSpace(proposal.RequestLabel),
			"requestSummary":           strings.TrimSpace(proposal.RequestSummary),
			"demoProfile":              strings.TrimSpace(proposal.DemoProfile),
			"subjectType":              strings.TrimSpace(proposal.SubjectType),
			"subjectId":                strings.TrimSpace(proposal.SubjectID),
			"approvedForProd":          proposal.ApprovedForProd,
			"environment":              strings.TrimSpace(proposal.Environment),
			"actionType":               strings.TrimSpace(proposal.ActionType),
			"actionClass":              strings.TrimSpace(proposal.ActionClass),
			"actionVerb":               strings.TrimSpace(proposal.ActionVerb),
			"actionTarget":             strings.TrimSpace(proposal.ActionTarget),
			"resourceKind":             strings.TrimSpace(proposal.ResourceKind),
			"resourceNamespace":        strings.TrimSpace(proposal.ResourceNamespace),
			"resourceName":             strings.TrimSpace(proposal.ResourceName),
			"resourceId":               strings.TrimSpace(proposal.ResourceID),
			"boundaryClass":            strings.TrimSpace(proposal.BoundaryClass),
			"riskTier":                 strings.TrimSpace(proposal.RiskTier),
			"requiredGrants":           append([]string(nil), proposal.RequiredGrants...),
			"evidenceReadiness":        strings.TrimSpace(proposal.EvidenceReadiness),
			"handshakeRequired":        proposal.HandshakeRequired,
			"operatorApprovalRequired": proposal.OperatorApprovalRequired,
			"dryRun":                   proposal.DryRun,
			"policyBucketId":           strings.TrimSpace(proposal.PolicyBucketID),
			"workflowKind":             strings.TrimSpace(proposal.WorkflowKind),
		}
		if proposal.FinanceOrder != nil {
			payload["financeOrder"] = JSONObject{
				"symbol":   strings.TrimSpace(proposal.FinanceOrder.Symbol),
				"side":     strings.TrimSpace(proposal.FinanceOrder.Side),
				"quantity": proposal.FinanceOrder.Quantity,
				"account":  strings.TrimSpace(proposal.FinanceOrder.Account),
			}
		}
		return payload
	}
	return JSONObject{
		"type":              normalizeStringOrDefault(proposal.Type, "terminal_command"),
		"summary":           strings.TrimSpace(proposal.Summary),
		"command":           strings.TrimSpace(proposal.Command),
		"stdin":             proposal.Stdin,
		"cwd":               strings.TrimSpace(proposal.CWD),
		"timeoutSeconds":    proposal.TimeoutSeconds,
		"readOnlyRequested": proposal.ReadOnlyRequested,
		"confidence":        normalizeStringOrDefault(proposal.Confidence, "structured"),
	}
}

func normalizeCodexFileWriteProposal(proposal codexStructuredProposal) (codexStructuredProposal, bool) {
	commandText := strings.TrimSpace(proposal.Command)
	if commandText == "" {
		return proposal, false
	}
	if match := codexPrintfRedirectPattern.FindStringSubmatch(commandText); len(match) == 3 {
		if stdin, ok := decodeCodexShellQuotedContent(match[1]); ok {
			proposal.Command = "tee " + match[2]
			proposal.Stdin = stdin
			proposal.ReadOnlyRequested = false
			return proposal, true
		}
	}
	if match := codexPrintfTeePattern.FindStringSubmatch(commandText); len(match) == 3 {
		if stdin, ok := decodeCodexShellQuotedContent(match[1]); ok {
			proposal.Command = "tee " + match[2]
			proposal.Stdin = stdin
			proposal.ReadOnlyRequested = false
			return proposal, true
		}
	}
	if match := codexPythonWritePattern.FindStringSubmatch(commandText); len(match) == 2 {
		if fileName, stdin, ok := decodeCodexPythonWrite(match[1]); ok {
			proposal.Command = "tee " + fileName
			proposal.Stdin = stdin
			proposal.ReadOnlyRequested = false
			return proposal, true
		}
	}
	return proposal, false
}

func decodeCodexShellQuotedContent(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < 2 {
		return "", false
	}
	switch trimmed[0] {
	case '"':
		if trimmed[len(trimmed)-1] != '"' {
			return "", false
		}
		value, err := strconv.Unquote(trimmed)
		if err != nil {
			return "", false
		}
		return value, true
	case '\'':
		if trimmed[len(trimmed)-1] != '\'' {
			return "", false
		}
		value := trimmed[1 : len(trimmed)-1]
		value = strings.ReplaceAll(value, `\n`, "\n")
		value = strings.ReplaceAll(value, `\t`, "\t")
		return value, true
	default:
		return "", false
	}
}

func decodeCodexPythonWrite(raw string) (string, string, bool) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < 2 {
		return "", "", false
	}
	if trimmed[0] == '"' && trimmed[len(trimmed)-1] == '"' {
		unquoted, err := strconv.Unquote(trimmed)
		if err != nil {
			return "", "", false
		}
		trimmed = unquoted
	} else if trimmed[0] == '\'' && trimmed[len(trimmed)-1] == '\'' {
		trimmed = trimmed[1 : len(trimmed)-1]
	}
	patterns := []struct {
		re        *regexp.Regexp
		quoteChar string
	}{
		{
			re:        regexp.MustCompile(`open\('([^']+)'\s*,\s*'w'\)\.write\('((?:[^'\\]|\\.)*)'\)`),
			quoteChar: "'",
		},
		{
			re:        regexp.MustCompile(`open\("([^"]+)"\s*,\s*"w"\)\.write\("((?:[^"\\]|\\.)*)"\)`),
			quoteChar: `"`,
		},
	}
	for _, pattern := range patterns {
		match := pattern.re.FindStringSubmatch(trimmed)
		if len(match) != 3 {
			continue
		}
		content, ok := decodeCodexShellQuotedContent(pattern.quoteChar + match[2] + pattern.quoteChar)
		if !ok {
			return "", "", false
		}
		return match[1], content, true
	}
	return "", "", false
}

func summarizeCodexCommandExecution(item codexProcessItem) string {
	command := strings.TrimSpace(item.Command)
	if command == "" {
		return ""
	}
	status := strings.TrimSpace(strings.ToLower(item.Status))
	output := strings.TrimSpace(item.AggregatedOutput)
	base := fmt.Sprintf("Command %s: %s", normalizeStringOrDefault(status, "completed"), command)
	if output == "" {
		return base
	}
	outputLines := splitManagedCodexOutput(output)
	if len(outputLines) == 0 {
		return base
	}
	return base + "\n" + outputLines[0]
}
