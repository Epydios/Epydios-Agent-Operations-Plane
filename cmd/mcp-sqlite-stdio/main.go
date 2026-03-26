package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultMCPProtocolVersion = "2025-03-26"

const (
	gatewayMCPProxyToolsPath    = "/v1/mcp/proxy/tools"
	gatewayMCPProxyToolCallPath = "/v1/mcp/proxy/tools/call"
)

type shimConfig struct {
	GatewayBaseURL  string
	GatewayToken    string
	TenantID        string
	ProjectID       string
	EnvironmentID   string
	ConnectorID     string
	ClientID        string
	ClientName      string
	ClientVersion   string
	ProtocolVersion string
	ServerName      string
}

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  interface{}     `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type initializeParams struct {
	ProtocolVersion string `json:"protocolVersion,omitempty"`
}

type toolsCallParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

type gatewayToolsListResponse struct {
	Tools []gatewayToolDescriptor `json:"tools"`
}

type gatewayToolDescriptor struct {
	Name        string                 `json:"name"`
	Title       string                 `json:"title,omitempty"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"inputSchema,omitempty"`
}

type gatewayToolCallResponse struct {
	ToolResult mcpCallToolResult `json:"toolResult"`
}

type gatewayAPIError struct {
	ErrorCode string                 `json:"errorCode"`
	Message   string                 `json:"message"`
	Retryable bool                   `json:"retryable"`
	Details   map[string]interface{} `json:"details"`
}

type mcpTextContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type mcpCallToolResult struct {
	Content           []mcpTextContent       `json:"content"`
	StructuredContent map[string]interface{} `json:"structuredContent,omitempty"`
	IsError           bool                   `json:"isError,omitempty"`
}

func main() {
	cfg := loadConfig()
	if cfg.GatewayBaseURL == "" {
		fatalf("EPYDIOS_MCP_GATEWAY_BASE_URL is required")
	}
	if cfg.GatewayToken == "" {
		fatalf("EPYDIOS_MCP_GATEWAY_TOKEN or EPYDIOS_MCP_GATEWAY_TOKEN_PATH is required")
	}
	if cfg.TenantID == "" || cfg.ProjectID == "" {
		fatalf("EPYDIOS_MCP_TENANT_ID and EPYDIOS_MCP_PROJECT_ID are required")
	}

	sessionPrefix := firstNonEmpty(strings.TrimSpace(cfg.ConnectorID), "connector")
	sessionID := fmt.Sprintf("mcp-%s-session-%d", sessionPrefix, time.Now().UTC().UnixNano())
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var req jsonRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			writeJSONRPC(writer, jsonRPCResponse{
				JSONRPC: "2.0",
				Error:   &jsonRPCError{Code: -32700, Message: "invalid JSON-RPC payload", Data: map[string]interface{}{"error": err.Error()}},
			})
			continue
		}
		if strings.TrimSpace(req.JSONRPC) == "" {
			req.JSONRPC = "2.0"
		}

		switch req.Method {
		case "initialize":
			var params initializeParams
			_ = json.Unmarshal(req.Params, &params)
			if strings.TrimSpace(params.ProtocolVersion) != "" {
				cfg.ProtocolVersion = strings.TrimSpace(params.ProtocolVersion)
			}
			writeJSONRPC(writer, jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: map[string]interface{}{
					"protocolVersion": cfg.ProtocolVersion,
					"capabilities": map[string]interface{}{
						"tools": map[string]interface{}{},
					},
					"serverInfo": map[string]interface{}{
						"name":    cfg.ServerName,
						"version": "0.1.0-beta",
					},
					"sessionId": sessionID,
				},
			})
		case "notifications/initialized":
			continue
		case "tools/list":
			tools, err := fetchGatewayToolsList(cfg)
			if err != nil {
				writeJSONRPC(writer, jsonRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Error:   &jsonRPCError{Code: -32000, Message: err.Error()},
				})
				continue
			}
			writeJSONRPC(writer, jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: map[string]interface{}{
					"tools": tools,
				},
			})
		case "tools/call":
			var params toolsCallParams
			if err := json.Unmarshal(req.Params, &params); err != nil {
				writeJSONRPC(writer, jsonRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Error:   &jsonRPCError{Code: -32602, Message: "invalid tools/call params", Data: map[string]interface{}{"error": err.Error()}},
				})
				continue
			}
			if strings.TrimSpace(params.Name) == "" {
				writeJSONRPC(writer, jsonRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Error:   &jsonRPCError{Code: -32602, Message: "tools/call requires params.name"},
				})
				continue
			}
			result, err := callGatewayTool(cfg, sessionID, req.ID, params)
			if err != nil {
				writeJSONRPC(writer, jsonRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Result: mcpCallToolResult{
						Content: []mcpTextContent{{
							Type: "text",
							Text: err.Error(),
						}},
						IsError: true,
					},
				})
				continue
			}
			writeJSONRPC(writer, jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result:  result,
			})
		default:
			if len(req.ID) == 0 {
				continue
			}
			writeJSONRPC(writer, jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &jsonRPCError{Code: -32601, Message: fmt.Sprintf("method %q is not supported by the bounded Epydios MCP shim", req.Method)},
			})
		}
	}
	if err := scanner.Err(); err != nil {
		fatalf("read stdio: %v", err)
	}
}

func loadConfig() shimConfig {
	token := strings.TrimSpace(os.Getenv("EPYDIOS_MCP_GATEWAY_TOKEN"))
	if token == "" {
		if tokenPath := strings.TrimSpace(os.Getenv("EPYDIOS_MCP_GATEWAY_TOKEN_PATH")); tokenPath != "" {
			content, err := os.ReadFile(tokenPath)
			if err != nil {
				fatalf("read gateway token path: %v", err)
			}
			token = strings.TrimSpace(string(content))
		}
	}
	return shimConfig{
		GatewayBaseURL:  strings.TrimRight(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_GATEWAY_BASE_URL")), "/"),
		GatewayToken:    token,
		TenantID:        strings.TrimSpace(os.Getenv("EPYDIOS_MCP_TENANT_ID")),
		ProjectID:       strings.TrimSpace(os.Getenv("EPYDIOS_MCP_PROJECT_ID")),
		EnvironmentID:   firstNonEmpty(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_ENVIRONMENT_ID")), "local"),
		ConnectorID:     strings.TrimSpace(os.Getenv("EPYDIOS_MCP_CONNECTOR_ID")),
		ClientID:        firstNonEmpty(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_CLIENT_ID")), "client-mcp-connector"),
		ClientName:      firstNonEmpty(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_CLIENT_NAME")), "Epydios MCP Connector Shim"),
		ClientVersion:   strings.TrimSpace(os.Getenv("EPYDIOS_MCP_CLIENT_VERSION")),
		ProtocolVersion: firstNonEmpty(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_PROTOCOL_VERSION")), defaultMCPProtocolVersion),
		ServerName:      firstNonEmpty(strings.TrimSpace(os.Getenv("EPYDIOS_MCP_SERVER_NAME")), "epydios-mcp-connector"),
	}
}

func fetchGatewayToolsList(cfg shimConfig) ([]gatewayToolDescriptor, error) {
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s%s?tenantId=%s&projectId=%s&environmentId=%s", cfg.GatewayBaseURL, gatewayMCPProxyToolsPath, urlQueryEscape(cfg.TenantID), urlQueryEscape(cfg.ProjectID), urlQueryEscape(cfg.EnvironmentID)), nil)
	if err != nil {
		return nil, fmt.Errorf("build tools/list request: %w", err)
	}
	if cfg.ConnectorID != "" {
		req.URL.RawQuery += "&connectorId=" + urlQueryEscape(cfg.ConnectorID)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.GatewayToken)
	resp, err := gatewayHTTPClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("gateway tools/list failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read tools/list response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("gateway tools/list rejected the request: %s", decodeGatewayErrorMessage(body))
	}
	var parsed gatewayToolsListResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode tools/list response: %w", err)
	}
	return parsed.Tools, nil
}

func callGatewayTool(cfg shimConfig, sessionID string, jsonrpcRequestID json.RawMessage, params toolsCallParams) (mcpCallToolResult, error) {
	requestBody := map[string]interface{}{
		"tenantId":        cfg.TenantID,
		"projectId":       cfg.ProjectID,
		"environmentId":   cfg.EnvironmentID,
		"connectorId":     cfg.ConnectorID,
		"toolName":        strings.TrimSpace(params.Name),
		"arguments":       params.Arguments,
		"sessionId":       sessionID,
		"protocolVersion": cfg.ProtocolVersion,
		"client": map[string]interface{}{
			"id":      cfg.ClientID,
			"name":    cfg.ClientName,
			"version": cfg.ClientVersion,
		},
	}
	if len(jsonrpcRequestID) > 0 {
		var requestID interface{}
		if err := json.Unmarshal(jsonrpcRequestID, &requestID); err == nil {
			requestBody["jsonrpcRequestId"] = requestID
		}
	}
	encoded, err := json.Marshal(requestBody)
	if err != nil {
		return mcpCallToolResult{}, fmt.Errorf("encode tools/call request: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, cfg.GatewayBaseURL+gatewayMCPProxyToolCallPath, bytes.NewReader(encoded))
	if err != nil {
		return mcpCallToolResult{}, fmt.Errorf("build tools/call request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.GatewayToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := gatewayHTTPClient().Do(req)
	if err != nil {
		return mcpCallToolResult{}, fmt.Errorf("gateway tools/call failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return mcpCallToolResult{}, fmt.Errorf("read tools/call response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return mcpCallToolResult{
			Content: []mcpTextContent{{
				Type: "text",
				Text: fmt.Sprintf("Gateway rejected the MCP tool call: %s", decodeGatewayErrorMessage(body)),
			}},
			IsError: true,
		}, nil
	}
	var parsed gatewayToolCallResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return mcpCallToolResult{}, fmt.Errorf("decode tools/call response: %w", err)
	}
	return parsed.ToolResult, nil
}

func decodeGatewayErrorMessage(body []byte) string {
	var apiErr gatewayAPIError
	if err := json.Unmarshal(body, &apiErr); err == nil && strings.TrimSpace(apiErr.Message) != "" {
		return strings.TrimSpace(apiErr.Message)
	}
	return strings.TrimSpace(string(body))
}

func gatewayHTTPClient() *http.Client {
	return &http.Client{Timeout: 20 * time.Second}
}

func writeJSONRPC(w *bufio.Writer, resp jsonRPCResponse) {
	encoded, err := json.Marshal(resp)
	if err != nil {
		fatalf("encode json-rpc response: %v", err)
	}
	if _, err := w.Write(append(encoded, '\n')); err != nil {
		fatalf("write json-rpc response: %v", err)
	}
	if err := w.Flush(); err != nil {
		fatalf("flush json-rpc response: %v", err)
	}
}

func urlQueryEscape(value string) string {
	replacer := strings.NewReplacer("%", "%25", "&", "%26", "=", "%3D", " ", "%20", "+", "%2B", "?", "%3F")
	return replacer.Replace(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
