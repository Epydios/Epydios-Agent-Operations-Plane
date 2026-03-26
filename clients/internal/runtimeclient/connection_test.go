package runtimeclient

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestCheckConnectionScopeRequired(t *testing.T) {
	client := NewClient(Config{RuntimeAPIBaseURL: "http://runtime.test"})
	status, err := client.CheckConnection(context.Background())
	if err != nil {
		t.Fatalf("CheckConnection() err = %v", err)
	}
	if status.State != "scope_required" {
		t.Fatalf("state=%q want scope_required", status.State)
	}
	if status.ScopeReady {
		t.Fatalf("scopeReady=%v want false", status.ScopeReady)
	}
}

func TestCheckConnectionAuthRequired(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusUnauthorized,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"error":"missing bearer token"}`)),
			Request:    req,
		}, nil
	})}
	client := NewClientWithHTTPClient(Config{
		RuntimeAPIBaseURL: "http://runtime.test",
		TenantID:          "tenant-demo",
		ProjectID:         "project-payments",
	}, httpClient)
	status, err := client.CheckConnection(context.Background())
	if err != nil {
		t.Fatalf("CheckConnection() err = %v", err)
	}
	if status.State != "auth_required" {
		t.Fatalf("state=%q want auth_required", status.State)
	}
	if status.AuthReady {
		t.Fatalf("authReady=%v want false", status.AuthReady)
	}
}

func TestCheckConnectionConnected(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		payload, _ := json.Marshal(TaskListResponse{
			Count: 1,
			Limit: 1,
			Items: []runtimeapi.TaskRecord{{TaskID: "task-cli-proof-1"}},
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(string(payload))),
			Request:    req,
		}, nil
	})}
	client := NewClientWithHTTPClient(Config{
		RuntimeAPIBaseURL: "http://runtime.test",
		TenantID:          "tenant-demo",
		ProjectID:         "project-payments",
		AuthToken:         "token-cli-proof",
	}, httpClient)
	status, err := client.CheckConnection(context.Background())
	if err != nil {
		t.Fatalf("CheckConnection() err = %v", err)
	}
	if status.State != "connected" {
		t.Fatalf("state=%q want connected", status.State)
	}
	if !status.AuthReady {
		t.Fatalf("authReady=%v want true", status.AuthReady)
	}
	if !status.ScopeReady {
		t.Fatalf("scopeReady=%v want true", status.ScopeReady)
	}
}
