package nativeapp

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func NewNativeAssetHandler(session *Session) http.Handler {
	return &nativeAssetHandler{
		session: session,
		client:  http.DefaultClient,
	}
}

type nativeAssetHandler struct {
	session *Session
	client  *http.Client
}

func (h *nativeAssetHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !shouldProxyRuntimeRoute(r.URL.Path) {
		http.NotFound(w, r)
		return
	}

	targetBaseURL, err := h.resolveTargetBaseURL(r.URL.Path)
	if err != nil {
		writeNativeRouteError(w, http.StatusServiceUnavailable, err)
		return
	}

	targetURL, err := resolveProxyURL(targetBaseURL, r.URL)
	if err != nil {
		writeNativeRouteError(w, http.StatusBadGateway, err)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		writeNativeRouteError(w, http.StatusBadGateway, err)
		return
	}
	req.Header = cloneProxyHeaders(r.Header)

	resp, err := h.client.Do(req)
	if err != nil {
		writeNativeRouteError(w, http.StatusBadGateway, fmt.Errorf("proxy runtime request: %w", err))
		return
	}
	defer resp.Body.Close()

	copyProxyHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func shouldProxyRuntimeRoute(path string) bool {
	switch {
	case path == "/healthz", path == "/readyz":
		return true
	case strings.HasPrefix(path, "/v1alpha1/"), strings.HasPrefix(path, "/v1alpha2/"):
		return true
	default:
		return false
	}
}

func (h *nativeAssetHandler) resolveTargetBaseURL(path string) (string, error) {
	if h == nil || h.session == nil {
		return "", fmt.Errorf("native session unavailable")
	}
	if h.session.Manifest.Mode != modeLive {
		return "", fmt.Errorf("runtime proxy unavailable outside live mode")
	}

	manifest := h.session.Manifest
	switch {
	case path == "/v1alpha1/providers" || strings.HasPrefix(path, "/v1alpha1/providers/"):
		if strings.TrimSpace(manifest.RegistryAPIBaseURL) != "" {
			return manifest.RegistryAPIBaseURL, nil
		}
	case strings.TrimSpace(manifest.RuntimeService.RuntimeAPIBaseURL) != "":
		return manifest.RuntimeService.RuntimeAPIBaseURL, nil
	case strings.TrimSpace(manifest.RuntimeAPIBaseURL) != "":
		return manifest.RuntimeAPIBaseURL, nil
	}
	return "", fmt.Errorf("runtime proxy target unavailable for %s", path)
}

func resolveProxyURL(baseURL string, requestURL *url.URL) (string, error) {
	target, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse proxy base url %q: %w", baseURL, err)
	}
	if target.Scheme == "" || target.Host == "" {
		return "", fmt.Errorf("invalid proxy base url %q", baseURL)
	}
	clone := *requestURL
	clone.Scheme = target.Scheme
	clone.Host = target.Host
	return clone.String(), nil
}

func cloneProxyHeaders(source http.Header) http.Header {
	headers := make(http.Header, len(source))
	for key, values := range source {
		if isHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			headers.Add(key, value)
		}
	}
	return headers
}

func copyProxyHeaders(dst, src http.Header) {
	for key, values := range src {
		if isHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func isHopByHopHeader(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func writeNativeRouteError(w http.ResponseWriter, status int, err error) {
	payload := map[string]any{
		"message": http.StatusText(status),
	}
	if err != nil {
		payload["details"] = map[string]any{
			"error": err.Error(),
		}
	}
	body, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		http.Error(w, http.StatusText(status), status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
