package nativeapp

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

const (
	mcpProtocolVersion20250326 = "2025-03-26"

	gatewayMCPLegacyToolsPath    = "/v1/mcp/tools"
	gatewayMCPLegacyToolCallPath = "/v1/mcp/tools/call"
	gatewayMCPProxyToolsPath     = "/v1/mcp/proxy/tools"
	gatewayMCPProxyToolCallPath  = "/v1/mcp/proxy/tools/call"

	gatewayMCPToolQueryReadOnly          = "query_read_only"
	gatewayMCPToolReadText               = "read_text"
	gatewayMCPToolListDirectory          = "list_directory"
	gatewayMCPToolGetPullRequest         = "get_pull_request"
	gatewayMCPToolGetPageMetadata        = "get_page_metadata"
	gatewayMCPToolExtractText            = "extract_text"
	gatewayMCPToolClickDestructiveButton = "click_destructive_button"
)

type gatewayMCPProxyContract struct {
	Driver          string
	Protocol        string
	Transport       string
	ToolDefinitions map[string]gatewayMCPProxyToolContract
}

type gatewayMCPProxyToolContract struct {
	Name               string
	Descriptor         gatewayMCPToolDescriptor
	RequestTitle       string
	ActionType         string
	ActionClass        string
	ActionVerb         string
	ResourceKind       string
	NormalizeArguments func(map[string]interface{}) (map[string]interface{}, error)
	BuildToolResult    func(gatewayGovernedActionResult, runtimeapi.RunRecord, gatewayMCPConnectorProfileEntry) gatewayMCPToolResult
}

func gatewayMCPContractForDriver(driver string) (gatewayMCPProxyContract, error) {
	switch strings.ToLower(strings.TrimSpace(driver)) {
	case "mcp_sqlite":
		return gatewayMCPProxyContract{
			Driver:    "mcp_sqlite",
			Protocol:  "mcp",
			Transport: "stdio_jsonrpc",
			ToolDefinitions: map[string]gatewayMCPProxyToolContract{
				gatewayMCPToolQueryReadOnly: {
					Name:         gatewayMCPToolQueryReadOnly,
					RequestTitle: "SQLite MCP tool call",
					ActionType:   "connector.sqlite.query",
					ActionClass:  "connector_read",
					ActionVerb:   "query",
					ResourceKind: "sqlite-database",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolQueryReadOnly,
						Title:       "Read-only SQLite query",
						Description: "Execute a governed read-only SQLite query through the Epydios MCP connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"query": map[string]interface{}{
									"type":        "string",
									"description": "A read-only SQLite statement such as SELECT or schema introspection.",
								},
							},
							"required":             []string{"query"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						query := strings.TrimSpace(interfaceString(args["query"]))
						if query == "" {
							return nil, fmt.Errorf("arguments.query is required")
						}
						return map[string]interface{}{
							"query": query,
						}, nil
					},
					BuildToolResult: buildGatewayMCPSQLiteToolResult,
				},
			},
		}, nil
	case "mcp_postgres":
		return gatewayMCPProxyContract{
			Driver:    "mcp_postgres",
			Protocol:  "mcp",
			Transport: "stdio_jsonrpc",
			ToolDefinitions: map[string]gatewayMCPProxyToolContract{
				gatewayMCPToolQueryReadOnly: {
					Name:         gatewayMCPToolQueryReadOnly,
					RequestTitle: "Postgres MCP tool call",
					ActionType:   "connector.postgres.query",
					ActionClass:  "connector_read",
					ActionVerb:   "query",
					ResourceKind: "postgres-database",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolQueryReadOnly,
						Title:       "Read-only Postgres query",
						Description: "Execute a governed read-only Postgres query through the Epydios MCP connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"query": map[string]interface{}{
									"type":        "string",
									"description": "A read-only Postgres statement such as SELECT, WITH, EXPLAIN, or SHOW.",
								},
							},
							"required":             []string{"query"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						query := strings.TrimSpace(interfaceString(args["query"]))
						if query == "" {
							return nil, fmt.Errorf("arguments.query is required")
						}
						return map[string]interface{}{
							"query": query,
						}, nil
					},
					BuildToolResult: buildGatewayMCPPostgresToolResult,
				},
			},
		}, nil
	case "mcp_filesystem":
		return gatewayMCPProxyContract{
			Driver:    "mcp_filesystem",
			Protocol:  "mcp",
			Transport: "stdio_jsonrpc",
			ToolDefinitions: map[string]gatewayMCPProxyToolContract{
				gatewayMCPToolReadText: {
					Name:         gatewayMCPToolReadText,
					RequestTitle: "Filesystem MCP read_text call",
					ActionType:   "connector.filesystem.read_text",
					ActionClass:  "connector_read",
					ActionVerb:   "read",
					ResourceKind: "filesystem-file",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolReadText,
						Title:       "Read text file",
						Description: "Read text content from a governed filesystem path inside the configured Epydios MCP root.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"path": map[string]interface{}{
									"type":        "string",
									"description": "A file path relative to the configured filesystem root.",
								},
							},
							"required":             []string{"path"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						path := strings.TrimSpace(interfaceString(args["path"]))
						if path == "" {
							return nil, fmt.Errorf("arguments.path is required")
						}
						return map[string]interface{}{
							"path": path,
						}, nil
					},
					BuildToolResult: buildGatewayMCPFilesystemReadToolResult,
				},
				gatewayMCPToolListDirectory: {
					Name:         gatewayMCPToolListDirectory,
					RequestTitle: "Filesystem MCP list_directory call",
					ActionType:   "connector.filesystem.list_directory",
					ActionClass:  "connector_read",
					ActionVerb:   "list",
					ResourceKind: "filesystem-directory",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolListDirectory,
						Title:       "List directory",
						Description: "List a governed directory inside the configured Epydios MCP filesystem root.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"path": map[string]interface{}{
									"type":        "string",
									"description": "A directory path relative to the configured filesystem root. Defaults to the root when omitted.",
								},
							},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						path := strings.TrimSpace(interfaceString(args["path"]))
						if path == "" {
							path = "."
						}
						return map[string]interface{}{
							"path": path,
						}, nil
					},
					BuildToolResult: buildGatewayMCPFilesystemListToolResult,
				},
			},
		}, nil
	case "mcp_github":
		return gatewayMCPProxyContract{
			Driver:    "mcp_github",
			Protocol:  "mcp",
			Transport: "stdio_jsonrpc",
			ToolDefinitions: map[string]gatewayMCPProxyToolContract{
				gatewayMCPToolGetPullRequest: {
					Name:         gatewayMCPToolGetPullRequest,
					RequestTitle: "GitHub MCP get_pull_request call",
					ActionType:   "connector.github.get_pull_request",
					ActionClass:  "connector_read",
					ActionVerb:   "read",
					ResourceKind: "github-pull-request",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolGetPullRequest,
						Title:       "Get pull request",
						Description: "Read a governed GitHub pull request through the Epydios MCP connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"owner": map[string]interface{}{
									"type":        "string",
									"description": "The GitHub owner or organization.",
								},
								"repo": map[string]interface{}{
									"type":        "string",
									"description": "The GitHub repository name.",
								},
								"pull_number": map[string]interface{}{
									"type":        "integer",
									"description": "The pull request number.",
								},
							},
							"required":             []string{"owner", "repo", "pull_number"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						owner := strings.ToLower(strings.TrimSpace(interfaceString(args["owner"])))
						repo := strings.ToLower(strings.TrimSpace(interfaceString(args["repo"])))
						pullNumber, ok := normalizeGatewayInteger(args["pull_number"])
						if owner == "" {
							return nil, fmt.Errorf("arguments.owner is required")
						}
						if repo == "" {
							return nil, fmt.Errorf("arguments.repo is required")
						}
						if !ok || pullNumber <= 0 {
							return nil, fmt.Errorf("arguments.pull_number must be >= 1")
						}
						return map[string]interface{}{
							"owner":       owner,
							"repo":        repo,
							"pull_number": pullNumber,
						}, nil
					},
					BuildToolResult: buildGatewayMCPGitHubToolResult,
				},
			},
		}, nil
	case "mcp_browser":
		return gatewayMCPProxyContract{
			Driver:    "mcp_browser",
			Protocol:  "mcp",
			Transport: "stdio_jsonrpc",
			ToolDefinitions: map[string]gatewayMCPProxyToolContract{
				gatewayMCPToolGetPageMetadata: {
					Name:         gatewayMCPToolGetPageMetadata,
					RequestTitle: "Browser MCP get_page_metadata call",
					ActionType:   "connector.browser.get_page_metadata",
					ActionClass:  "connector_read",
					ActionVerb:   "observe",
					ResourceKind: "browser-page",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolGetPageMetadata,
						Title:       "Get page metadata",
						Description: "Read bounded page metadata through the Epydios MCP browser connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"url": map[string]interface{}{
									"type":        "string",
									"description": "A bounded http or https URL inside the configured browser origin allowlist.",
								},
							},
							"required":             []string{"url"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						pageURL := strings.TrimSpace(interfaceString(args["url"]))
						if pageURL == "" {
							return nil, fmt.Errorf("arguments.url is required")
						}
						return map[string]interface{}{
							"url": pageURL,
						}, nil
					},
					BuildToolResult: buildGatewayMCPBrowserMetadataToolResult,
				},
				gatewayMCPToolExtractText: {
					Name:         gatewayMCPToolExtractText,
					RequestTitle: "Browser MCP extract_text call",
					ActionType:   "connector.browser.extract_text",
					ActionClass:  "connector_read",
					ActionVerb:   "read",
					ResourceKind: "browser-page",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolExtractText,
						Title:       "Extract page text",
						Description: "Extract bounded page text through the Epydios MCP browser connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"url": map[string]interface{}{
									"type":        "string",
									"description": "A bounded http or https URL inside the configured browser origin allowlist.",
								},
							},
							"required":             []string{"url"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						pageURL := strings.TrimSpace(interfaceString(args["url"]))
						if pageURL == "" {
							return nil, fmt.Errorf("arguments.url is required")
						}
						return map[string]interface{}{
							"url": pageURL,
						}, nil
					},
					BuildToolResult: buildGatewayMCPBrowserTextToolResult,
				},
				gatewayMCPToolClickDestructiveButton: {
					Name:         gatewayMCPToolClickDestructiveButton,
					RequestTitle: "Browser MCP click_destructive_button call",
					ActionType:   "connector.browser.click_destructive_button",
					ActionClass:  "connector_write",
					ActionVerb:   "click",
					ResourceKind: "browser-page-control",
					Descriptor: gatewayMCPToolDescriptor{
						Name:        gatewayMCPToolClickDestructiveButton,
						Title:       "Click destructive button",
						Description: "Request one approval-gated destructive button click through the bounded Epydios MCP browser connector path.",
						InputSchema: map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"url": map[string]interface{}{
									"type":        "string",
									"description": "A bounded http or https URL inside the configured browser origin allowlist.",
								},
								"selector": map[string]interface{}{
									"type":        "string",
									"description": "A bounded button selector in #id form.",
								},
								"expected_label": map[string]interface{}{
									"type":        "string",
									"description": "The exact destructive button label expected by the operator.",
								},
							},
							"required":             []string{"url", "selector", "expected_label"},
							"additionalProperties": false,
						},
					},
					NormalizeArguments: func(args map[string]interface{}) (map[string]interface{}, error) {
						pageURL := strings.TrimSpace(interfaceString(args["url"]))
						selector := strings.TrimSpace(interfaceString(args["selector"]))
						expectedLabel := strings.TrimSpace(firstNonEmpty(interfaceString(args["expected_label"]), interfaceString(args["expectedLabel"])))
						if pageURL == "" {
							return nil, fmt.Errorf("arguments.url is required")
						}
						if selector == "" {
							return nil, fmt.Errorf("arguments.selector is required")
						}
						if expectedLabel == "" {
							return nil, fmt.Errorf("arguments.expected_label is required")
						}
						return map[string]interface{}{
							"url":            pageURL,
							"selector":       selector,
							"expected_label": expectedLabel,
						}, nil
					},
					BuildToolResult: buildGatewayMCPBrowserClickToolResult,
				},
			},
		}, nil
	default:
		return gatewayMCPProxyContract{}, fmt.Errorf("connector driver %q is not registered for MCP proxy interposition", strings.TrimSpace(driver))
	}
}

func gatewayResolveMCPProxyProfile(raw json.RawMessage, requestedID string) (gatewayMCPConnectorProfileEntry, gatewayMCPProxyContract, error) {
	var settings gatewayMCPConnectorSettings
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" {
		return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, fmt.Errorf("connector settings are not configured")
	}
	if err := json.Unmarshal(raw, &settings); err != nil {
		return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, fmt.Errorf("decode connector settings: %w", err)
	}
	resolvedID := strings.ToLower(strings.TrimSpace(requestedID))
	if resolvedID == "" {
		resolvedID = strings.ToLower(strings.TrimSpace(settings.SelectedConnectorID))
	}
	if resolvedID == "" && len(settings.Profiles) == 1 {
		resolvedID = strings.ToLower(strings.TrimSpace(settings.Profiles[0].ID))
	}
	if resolvedID == "" {
		return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, fmt.Errorf("connector profile is required")
	}
	for _, profile := range settings.Profiles {
		if strings.ToLower(strings.TrimSpace(profile.ID)) != resolvedID {
			continue
		}
		if profile.Enabled != nil && !*profile.Enabled {
			return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, fmt.Errorf("connector profile %q is disabled", profile.ID)
		}
		contract, err := gatewayMCPContractForDriver(profile.Driver)
		if err != nil {
			return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, err
		}
		return profile, contract, nil
	}
	return gatewayMCPConnectorProfileEntry{}, gatewayMCPProxyContract{}, fmt.Errorf("connector profile %q is not configured", resolvedID)
}

func gatewayMCPToolDescriptors(profile gatewayMCPConnectorProfileEntry, contract gatewayMCPProxyContract) []gatewayMCPToolDescriptor {
	tools := make([]gatewayMCPToolDescriptor, 0, len(contract.ToolDefinitions))
	for _, tool := range contract.ToolDefinitions {
		if !gatewayMCPProfileAllowsTool(profile, tool.Name) {
			continue
		}
		descriptor := tool.Descriptor
		if strings.TrimSpace(descriptor.Description) == "" {
			descriptor.Description = fmt.Sprintf("Execute governed %s through the Epydios MCP proxy contract for %s.", tool.Name, firstNonEmpty(profile.Label, profile.ID))
		}
		tools = append(tools, descriptor)
	}
	sort.Slice(tools, func(i, j int) bool {
		return tools[i].Name < tools[j].Name
	})
	return tools
}

func gatewayMCPToolContract(profile gatewayMCPConnectorProfileEntry, contract gatewayMCPProxyContract, toolName string) (gatewayMCPProxyToolContract, error) {
	normalizedTool := strings.ToLower(strings.TrimSpace(toolName))
	if normalizedTool == "" {
		return gatewayMCPProxyToolContract{}, fmt.Errorf("tool name is required")
	}
	tool, ok := contract.ToolDefinitions[normalizedTool]
	if !ok {
		return gatewayMCPProxyToolContract{}, fmt.Errorf("tool %q is not supported by the %s MCP proxy contract", normalizedTool, contract.Driver)
	}
	if !gatewayMCPProfileAllowsTool(profile, normalizedTool) {
		return gatewayMCPProxyToolContract{}, fmt.Errorf("connector profile %q does not allow %s", profile.ID, normalizedTool)
	}
	return tool, nil
}

func gatewayMCPProfileAllowsTool(profile gatewayMCPConnectorProfileEntry, toolName string) bool {
	normalizedTool := strings.ToLower(strings.TrimSpace(toolName))
	for _, item := range profile.AllowedTools {
		if strings.ToLower(strings.TrimSpace(item)) == normalizedTool {
			return true
		}
	}
	return false
}

func buildGatewayMCPSQLiteToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPQueryToolResult("SQLite", "sqlite", result, run, profile)
}

func buildGatewayMCPPostgresToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPQueryToolResult("Postgres", "postgres", result, run, profile)
}

func buildGatewayMCPFilesystemReadToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPFilesystemToolResult("read_text", result, run, profile)
}

func buildGatewayMCPFilesystemListToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPFilesystemToolResult("list_directory", result, run, profile)
}

func buildGatewayMCPGitHubToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	payloadEcho := gatewayEvidencePayloadEcho(run.EvidenceRecordResponse)
	connectorPayload, _ := payloadEcho["connector"].(map[string]interface{})
	classification, _ := connectorPayload["classification"].(map[string]interface{})
	connectorResult, _ := connectorPayload["result"].(map[string]interface{})
	connectorInfo, _ := connectorPayload["connector"].(map[string]interface{})

	structured := map[string]interface{}{
		"gatewayRequestId":       result.GatewayRequestID,
		"interpositionRequestId": result.InterpositionRequestID,
		"runId":                  result.RunID,
		"policyDecision":         result.PolicyDecision,
		"state":                  result.State,
		"receiptRef":             result.ReceiptRef,
		"statusUrl":              result.StatusURL,
		"runUrl":                 result.RunURL,
	}
	if result.ApprovalID != "" {
		structured["approvalId"] = result.ApprovalID
	}
	if len(connectorInfo) > 0 {
		structured["connector"] = connectorInfo
	}
	if len(classification) > 0 {
		structured["classification"] = classification
	}
	if len(connectorResult) > 0 {
		structured["result"] = connectorResult
	}

	text := "GitHub MCP get_pull_request completed."
	isError := false
	switch strings.ToUpper(strings.TrimSpace(result.PolicyDecision)) {
	case "DENY":
		isError = true
		text = "GitHub MCP get_pull_request was denied before execution."
		if reason := firstNonEmpty(strings.TrimSpace(interfaceString(classification["reason"])), strings.TrimSpace(interfaceString(connectorPayload["reason"])), strings.TrimSpace(run.ErrorMessage)); reason != "" {
			text = fmt.Sprintf("GitHub MCP get_pull_request was denied before execution: %s", reason)
		}
	case "DEFER":
		isError = true
		text = "GitHub MCP get_pull_request is waiting for approval before execution."
	default:
		owner := strings.TrimSpace(interfaceString(connectorResult["owner"]))
		repo := strings.TrimSpace(interfaceString(connectorResult["repo"]))
		title := strings.TrimSpace(interfaceString(connectorResult["pullTitle"]))
		pullNumber, hasPullNumber := numericGatewayValue(connectorResult["pullNumber"])
		if hasPullNumber {
			text = fmt.Sprintf("GitHub MCP get_pull_request completed for %s/%s#%d.", firstNonEmpty(owner, "owner"), firstNonEmpty(repo, "repo"), pullNumber)
			if title != "" {
				text = fmt.Sprintf("GitHub MCP get_pull_request completed for %s/%s#%d: %s", firstNonEmpty(owner, "owner"), firstNonEmpty(repo, "repo"), pullNumber, title)
			}
		}
	}
	return gatewayMCPToolResult{
		Content: []gatewayMCPToolContent{{
			Type: "text",
			Text: text,
		}},
		StructuredContent: structured,
		IsError:           isError,
	}
}

func buildGatewayMCPBrowserMetadataToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPBrowserToolResult(gatewayMCPToolGetPageMetadata, result, run, profile)
}

func buildGatewayMCPBrowserTextToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPBrowserToolResult(gatewayMCPToolExtractText, result, run, profile)
}

func buildGatewayMCPBrowserClickToolResult(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	return buildGatewayMCPBrowserToolResult(gatewayMCPToolClickDestructiveButton, result, run, profile)
}

func buildGatewayMCPQueryToolResult(titleCaseName string, lowerName string, result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	payloadEcho := gatewayEvidencePayloadEcho(run.EvidenceRecordResponse)
	connectorPayload, _ := payloadEcho["connector"].(map[string]interface{})
	classification, _ := connectorPayload["classification"].(map[string]interface{})
	connectorResult, _ := connectorPayload["result"].(map[string]interface{})
	connectorInfo, _ := connectorPayload["connector"].(map[string]interface{})

	structured := map[string]interface{}{
		"gatewayRequestId":       result.GatewayRequestID,
		"interpositionRequestId": result.InterpositionRequestID,
		"runId":                  result.RunID,
		"policyDecision":         result.PolicyDecision,
		"state":                  result.State,
		"receiptRef":             result.ReceiptRef,
		"statusUrl":              result.StatusURL,
		"runUrl":                 result.RunURL,
	}
	if result.ApprovalID != "" {
		structured["approvalId"] = result.ApprovalID
	}
	if len(connectorInfo) > 0 {
		structured["connector"] = connectorInfo
	}
	if len(classification) > 0 {
		structured["classification"] = classification
	}
	if len(connectorResult) > 0 {
		structured["result"] = connectorResult
	}

	text := fmt.Sprintf("%s MCP tool call completed.", titleCaseName)
	isError := false
	switch strings.ToUpper(strings.TrimSpace(result.PolicyDecision)) {
	case "DENY":
		isError = true
		text = fmt.Sprintf("%s MCP tool call was denied before execution.", titleCaseName)
		if reason := firstNonEmpty(strings.TrimSpace(interfaceString(classification["reason"])), strings.TrimSpace(interfaceString(connectorPayload["reason"])), strings.TrimSpace(run.ErrorMessage)); reason != "" {
			text = fmt.Sprintf("%s MCP tool call was denied before execution: %s", titleCaseName, reason)
		}
	case "DEFER":
		isError = true
		text = fmt.Sprintf("%s MCP tool call is waiting for approval before execution.", titleCaseName)
	default:
		if rows, ok := numericGatewayValue(connectorResult["rowCount"]); ok {
			label := firstNonEmpty(strings.TrimSpace(interfaceString(connectorInfo["label"])), firstNonEmpty(profile.Label, profile.ID), fmt.Sprintf("configured %s profile", lowerName))
			text = fmt.Sprintf("%s MCP read-only query completed with %d row(s) on %s.", titleCaseName, rows, label)
		}
	}
	return gatewayMCPToolResult{
		Content: []gatewayMCPToolContent{{
			Type: "text",
			Text: text,
		}},
		StructuredContent: structured,
		IsError:           isError,
	}
}

func normalizeGatewayInteger(value interface{}) (int, bool) {
	number, ok := numericGatewayValue(value)
	if ok {
		return number, true
	}
	text := strings.TrimSpace(interfaceString(value))
	if text == "" {
		return 0, false
	}
	parsed, err := strconv.Atoi(text)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func buildGatewayMCPFilesystemToolResult(toolName string, result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	payloadEcho := gatewayEvidencePayloadEcho(run.EvidenceRecordResponse)
	connectorPayload, _ := payloadEcho["connector"].(map[string]interface{})
	classification, _ := connectorPayload["classification"].(map[string]interface{})
	connectorResult, _ := connectorPayload["result"].(map[string]interface{})
	connectorInfo, _ := connectorPayload["connector"].(map[string]interface{})

	structured := map[string]interface{}{
		"gatewayRequestId":       result.GatewayRequestID,
		"interpositionRequestId": result.InterpositionRequestID,
		"runId":                  result.RunID,
		"policyDecision":         result.PolicyDecision,
		"state":                  result.State,
		"receiptRef":             result.ReceiptRef,
		"statusUrl":              result.StatusURL,
		"runUrl":                 result.RunURL,
	}
	if result.ApprovalID != "" {
		structured["approvalId"] = result.ApprovalID
	}
	if len(connectorInfo) > 0 {
		structured["connector"] = connectorInfo
	}
	if len(classification) > 0 {
		structured["classification"] = classification
	}
	if len(connectorResult) > 0 {
		structured["result"] = connectorResult
	}

	text := "Filesystem MCP tool call completed."
	isError := false
	switch strings.ToUpper(strings.TrimSpace(result.PolicyDecision)) {
	case "DENY":
		isError = true
		text = "Filesystem MCP tool call was denied before execution."
		if reason := firstNonEmpty(strings.TrimSpace(interfaceString(classification["reason"])), strings.TrimSpace(interfaceString(connectorPayload["reason"])), strings.TrimSpace(run.ErrorMessage)); reason != "" {
			text = fmt.Sprintf("Filesystem MCP tool call was denied before execution: %s", reason)
		}
	case "DEFER":
		isError = true
		text = "Filesystem MCP tool call is waiting for approval before execution."
	default:
		label := firstNonEmpty(strings.TrimSpace(interfaceString(connectorInfo["label"])), firstNonEmpty(profile.Label, profile.ID), "configured filesystem profile")
		relativePath := strings.TrimSpace(interfaceString(connectorResult["relativePath"]))
		switch toolName {
		case "read_text":
			if bytesRead, ok := numericGatewayValue(connectorResult["bytesRead"]); ok {
				text = fmt.Sprintf("Filesystem MCP read_text completed for %s on %s (%d byte(s)).", firstNonEmpty(relativePath, "requested path"), label, bytesRead)
			}
		case "list_directory":
			if entryCount, ok := numericGatewayValue(connectorResult["entryCount"]); ok {
				text = fmt.Sprintf("Filesystem MCP list_directory completed for %s on %s (%d item(s)).", firstNonEmpty(relativePath, "."), label, entryCount)
			}
		}
	}
	return gatewayMCPToolResult{
		Content: []gatewayMCPToolContent{{
			Type: "text",
			Text: text,
		}},
		StructuredContent: structured,
		IsError:           isError,
	}
}

func buildGatewayMCPBrowserToolResult(toolName string, result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry) gatewayMCPToolResult {
	payloadEcho := gatewayEvidencePayloadEcho(run.EvidenceRecordResponse)
	connectorPayload, _ := payloadEcho["connector"].(map[string]interface{})
	classification, _ := connectorPayload["classification"].(map[string]interface{})
	connectorResult, _ := connectorPayload["result"].(map[string]interface{})
	connectorInfo, _ := connectorPayload["connector"].(map[string]interface{})

	structured := map[string]interface{}{
		"gatewayRequestId":       result.GatewayRequestID,
		"interpositionRequestId": result.InterpositionRequestID,
		"runId":                  result.RunID,
		"policyDecision":         result.PolicyDecision,
		"state":                  result.State,
		"receiptRef":             result.ReceiptRef,
		"statusUrl":              result.StatusURL,
		"runUrl":                 result.RunURL,
	}
	if result.ApprovalID != "" {
		structured["approvalId"] = result.ApprovalID
	}
	if len(connectorInfo) > 0 {
		structured["connector"] = connectorInfo
	}
	if len(classification) > 0 {
		structured["classification"] = classification
	}
	if len(connectorResult) > 0 {
		structured["result"] = connectorResult
	}

	text := "Browser MCP tool call completed."
	isError := false
	switch strings.ToUpper(strings.TrimSpace(result.PolicyDecision)) {
	case "DENY":
		isError = true
		text = "Browser MCP tool call was denied before execution."
		if reason := firstNonEmpty(strings.TrimSpace(interfaceString(classification["reason"])), strings.TrimSpace(interfaceString(connectorPayload["reason"])), strings.TrimSpace(run.ErrorMessage)); reason != "" {
			text = fmt.Sprintf("Browser MCP tool call was denied before execution: %s", reason)
		}
	case "DEFER":
		isError = true
		text = "Browser MCP tool call is waiting for approval before execution."
	default:
		label := firstNonEmpty(strings.TrimSpace(interfaceString(connectorInfo["label"])), firstNonEmpty(profile.Label, profile.ID), "configured browser profile")
		finalURL := strings.TrimSpace(interfaceString(connectorResult["finalUrl"]))
		pageTitle := strings.TrimSpace(interfaceString(connectorResult["pageTitle"]))
		switch toolName {
		case gatewayMCPToolGetPageMetadata:
			text = fmt.Sprintf("Browser MCP get_page_metadata completed for %s on %s.", firstNonEmpty(finalURL, "page"), label)
			if pageTitle != "" {
				text = fmt.Sprintf("Browser MCP get_page_metadata completed for %s on %s: %s", firstNonEmpty(finalURL, "page"), label, pageTitle)
			}
		case gatewayMCPToolExtractText:
			if bytesRead, ok := numericGatewayValue(connectorResult["bytesRead"]); ok {
				text = fmt.Sprintf("Browser MCP extract_text completed for %s on %s (%d byte(s)).", firstNonEmpty(finalURL, "page"), label, bytesRead)
			}
		case gatewayMCPToolClickDestructiveButton:
			resolvedLabel := strings.TrimSpace(interfaceString(connectorResult["resolvedLabel"]))
			postClickFinalURL := strings.TrimSpace(interfaceString(connectorResult["postClickFinalUrl"]))
			text = fmt.Sprintf("Browser MCP click_destructive_button completed for %s on %s.", firstNonEmpty(resolvedLabel, "destructive control"), label)
			if postClickFinalURL != "" {
				text = fmt.Sprintf("Browser MCP click_destructive_button completed for %s on %s and landed on %s.", firstNonEmpty(resolvedLabel, "destructive control"), label, postClickFinalURL)
			}
		}
	}
	return gatewayMCPToolResult{
		Content: []gatewayMCPToolContent{{
			Type: "text",
			Text: text,
		}},
		StructuredContent: structured,
		IsError:           isError,
	}
}
