package runtime

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

var extensionProviderGVK = schema.GroupVersionKind{
	Group:   "controlplane.epydios.ai",
	Version: "v1alpha1",
	Kind:    "ExtensionProvider",
}

var extensionProviderListGVK = schema.GroupVersionKind{
	Group:   "controlplane.epydios.ai",
	Version: "v1alpha1",
	Kind:    "ExtensionProviderList",
}

type ProviderTarget struct {
	Name           string
	Namespace      string
	ProviderType   string
	ProviderID     string
	EndpointURL    string
	TimeoutSeconds int64
	Priority       int64
	TargetOS       string
	AuthMode       string

	BearerSecretName string
	BearerSecretKey  string
	ClientTLSSecret  string
	CASecret         string
}

type ProviderClient interface {
	SelectProvider(ctx context.Context, namespace, providerType, requiredCapability, targetOS string, minPriority int64) (*ProviderTarget, error)
	PostJSON(ctx context.Context, target *ProviderTarget, path string, reqBody interface{}, out interface{}) error
}

type ProviderRegistry struct {
	k8s               client.Client
	localOverridePath string
}

type localProviderOverride struct {
	Active         bool     `json:"active"`
	ProviderType   string   `json:"providerType"`
	ProviderID     string   `json:"providerId"`
	ProviderName   string   `json:"providerName"`
	EndpointURL    string   `json:"endpointUrl"`
	TimeoutSeconds int64    `json:"timeoutSeconds"`
	AuthMode       string   `json:"authMode"`
	Capabilities   []string `json:"capabilities"`
}

func NewProviderRegistry(k8s client.Client, localOverridePath string) *ProviderRegistry {
	return &ProviderRegistry{k8s: k8s, localOverridePath: strings.TrimSpace(localOverridePath)}
}

func (r *ProviderRegistry) SelectProvider(ctx context.Context, namespace, providerType, requiredCapability, targetOS string, minPriority int64) (*ProviderTarget, error) {
	if override, ok := r.selectLocalOverride(providerType, requiredCapability, targetOS, minPriority); ok {
		return override, nil
	}
	if r.k8s == nil {
		if providerType == "DesktopProvider" && normalizeProviderTargetOS(targetOS) != "" {
			return nil, fmt.Errorf("no provider found (type=%s capability=%s targetOS=%s minPriority=%d)", providerType, requiredCapability, normalizeProviderTargetOS(targetOS), minPriority)
		}
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}

	list := &unstructured.UnstructuredList{}
	list.SetGroupVersionKind(extensionProviderListGVK)
	if err := r.k8s.List(ctx, list, client.InNamespace(namespace)); err != nil {
		return nil, fmt.Errorf("list ExtensionProvider: %w", err)
	}
	normalizedTargetOS := normalizeProviderTargetOS(targetOS)

	candidates := make([]ProviderTarget, 0, len(list.Items))
	for _, item := range list.Items {
		spec, _, _ := unstructured.NestedMap(item.Object, "spec")
		status, _, _ := unstructured.NestedMap(item.Object, "status")

		ptype, _, _ := unstructured.NestedString(spec, "providerType")
		if ptype != providerType {
			continue
		}
		providerID, _, _ := unstructured.NestedString(status, "resolved", "providerId")
		if strings.TrimSpace(providerID) == "" {
			providerID, _, _ = unstructured.NestedString(spec, "providerId")
		}
		if strings.TrimSpace(providerID) == "" {
			providerID = item.GetName()
		}
		providerTargetOS := resolveProviderTargetOS(item, spec, status, providerID)
		if ptype == "DesktopProvider" && normalizedTargetOS != "" && !providerTargetOSMatches(providerTargetOS, normalizedTargetOS) {
			continue
		}

		enabled, found, _ := unstructured.NestedBool(spec, "selection", "enabled")
		if !found {
			enabled = true
		}
		if !enabled {
			continue
		}

		priority, found, _ := unstructured.NestedInt64(spec, "selection", "priority")
		if !found {
			priority = 100
		}
		if priority < minPriority {
			continue
		}

		if !hasConditionTrue(status, "Ready") || !hasConditionTrue(status, "Probed") {
			continue
		}

		caps := resolvedCapabilities(status)
		if len(caps) == 0 {
			caps = advertisedCapabilities(spec)
		}
		if requiredCapability != "" && !containsString(caps, requiredCapability) {
			continue
		}

		endpointURL, _, _ := unstructured.NestedString(spec, "endpoint", "url")
		if strings.TrimSpace(endpointURL) == "" {
			continue
		}
		timeoutSeconds, found, _ := unstructured.NestedInt64(spec, "endpoint", "timeoutSeconds")
		if !found || timeoutSeconds <= 0 {
			timeoutSeconds = 10
		}

		authMode, _, _ := unstructured.NestedString(spec, "auth", "mode")
		bearerName, _, _ := unstructured.NestedString(spec, "auth", "bearerTokenSecretRef", "name")
		bearerKey, found, _ := unstructured.NestedString(spec, "auth", "bearerTokenSecretRef", "key")
		if !found || bearerKey == "" {
			bearerKey = "token"
		}
		clientTLSSecret, _, _ := unstructured.NestedString(spec, "auth", "clientTLSSecretRef", "name")
		caSecret, _, _ := unstructured.NestedString(spec, "auth", "caSecretRef", "name")

		candidates = append(candidates, ProviderTarget{
			Name:             item.GetName(),
			Namespace:        item.GetNamespace(),
			ProviderType:     ptype,
			ProviderID:       providerID,
			EndpointURL:      endpointURL,
			TimeoutSeconds:   timeoutSeconds,
			Priority:         priority,
			TargetOS:         providerTargetOS,
			AuthMode:         firstNonEmpty(authMode, "None"),
			BearerSecretName: bearerName,
			BearerSecretKey:  bearerKey,
			ClientTLSSecret:  clientTLSSecret,
			CASecret:         caSecret,
		})
	}

	if len(candidates) == 0 {
		if providerType == "DesktopProvider" && normalizedTargetOS != "" {
			return nil, fmt.Errorf("no provider found (type=%s capability=%s targetOS=%s minPriority=%d)", providerType, requiredCapability, normalizedTargetOS, minPriority)
		}
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Priority != candidates[j].Priority {
			return candidates[i].Priority > candidates[j].Priority
		}
		return candidates[i].Name < candidates[j].Name
	})

	chosen := candidates[0]
	return &chosen, nil
}

func (r *ProviderRegistry) selectLocalOverride(providerType, requiredCapability, targetOS string, minPriority int64) (*ProviderTarget, bool) {
	override, ok := r.readLocalOverride()
	if !ok {
		return nil, false
	}
	if !strings.EqualFold(strings.TrimSpace(override.ProviderType), providerType) {
		return nil, false
	}
	if requiredCapability != "" && !containsString(override.Capabilities, requiredCapability) {
		return nil, false
	}
	if providerType == "DesktopProvider" && normalizeProviderTargetOS(targetOS) != "" {
		return nil, false
	}
	if minPriority > 0 && 1000 < minPriority {
		return nil, false
	}
	name := firstNonEmpty(override.ProviderName, override.ProviderID, "local-provider-override")
	return &ProviderTarget{
		Name:           name,
		Namespace:      "",
		ProviderType:   strings.TrimSpace(override.ProviderType),
		ProviderID:     firstNonEmpty(override.ProviderID, name),
		EndpointURL:    strings.TrimSpace(override.EndpointURL),
		TimeoutSeconds: defaultInt64(override.TimeoutSeconds, 10),
		Priority:       1000,
		TargetOS:       "",
		AuthMode:       firstNonEmpty(override.AuthMode, "None"),
	}, true
}

func (r *ProviderRegistry) readLocalOverride() (*localProviderOverride, bool) {
	if strings.TrimSpace(r.localOverridePath) == "" {
		return nil, false
	}
	raw, err := os.ReadFile(r.localOverridePath)
	if err != nil {
		return nil, false
	}
	var payload localProviderOverride
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	if !payload.Active || strings.TrimSpace(payload.EndpointURL) == "" || strings.TrimSpace(payload.ProviderType) == "" {
		return nil, false
	}
	return &payload, true
}

func (r *ProviderRegistry) PostJSON(ctx context.Context, target *ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	baseURL, err := url.Parse(target.EndpointURL)
	if err != nil {
		return fmt.Errorf("invalid provider endpoint URL %q: %w", target.EndpointURL, err)
	}
	reqURL := *baseURL
	reqURL.Path = joinURLPath(baseURL.Path, path)

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal provider request: %w", err)
	}

	clientHTTP, headers, err := r.httpClientAndHeaders(ctx, target, reqURL.Scheme)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, vals := range headers {
		for _, v := range vals {
			req.Header.Add(k, v)
		}
	}

	resp, err := clientHTTP.Do(req)
	if err != nil {
		return fmt.Errorf("provider call failed %s: %w", reqURL.String(), err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("provider call failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}

	if out == nil {
		return nil
	}
	if err := json.Unmarshal(respBytes, out); err != nil {
		return fmt.Errorf("decode provider response: %w", err)
	}
	return nil
}

func (r *ProviderRegistry) httpClientAndHeaders(ctx context.Context, target *ProviderTarget, scheme string) (*http.Client, http.Header, error) {
	headers := make(http.Header)
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}

	switch target.AuthMode {
	case "", "None":
	case "BearerTokenSecret":
		token, err := r.readSecretToken(ctx, target.Namespace, target.BearerSecretName, target.BearerSecretKey)
		if err != nil {
			return nil, nil, err
		}
		headers.Set("Authorization", "Bearer "+token)
	case "MTLS":
		if !strings.EqualFold(scheme, "https") {
			return nil, nil, fmt.Errorf("auth mode %q requires https endpoint for provider %s", target.AuthMode, target.Name)
		}
		mtls, err := r.buildMutualTLSConfig(ctx, target)
		if err != nil {
			return nil, nil, err
		}
		tlsCfg = mtls
	case "MTLSAndBearerTokenSecret":
		if !strings.EqualFold(scheme, "https") {
			return nil, nil, fmt.Errorf("auth mode %q requires https endpoint for provider %s", target.AuthMode, target.Name)
		}
		token, err := r.readSecretToken(ctx, target.Namespace, target.BearerSecretName, target.BearerSecretKey)
		if err != nil {
			return nil, nil, err
		}
		headers.Set("Authorization", "Bearer "+token)
		mtls, err := r.buildMutualTLSConfig(ctx, target)
		if err != nil {
			return nil, nil, err
		}
		tlsCfg = mtls
	default:
		return nil, nil, fmt.Errorf("unsupported auth mode %q for provider %s", target.AuthMode, target.Name)
	}

	timeoutSeconds := target.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	httpClient := &http.Client{
		Timeout: time.Duration(timeoutSeconds) * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: tlsCfg,
		},
	}
	return httpClient, headers, nil
}

func (r *ProviderRegistry) readSecretToken(ctx context.Context, namespace, secretName, key string) (string, error) {
	if strings.TrimSpace(secretName) == "" {
		return "", fmt.Errorf("missing auth.bearerTokenSecretRef.name")
	}
	if strings.TrimSpace(key) == "" {
		key = "token"
	}
	var secret corev1.Secret
	if err := r.k8s.Get(ctx, types.NamespacedName{Namespace: namespace, Name: secretName}, &secret); err != nil {
		return "", fmt.Errorf("read secret %s/%s: %w", namespace, secretName, err)
	}
	raw, ok := secret.Data[key]
	if !ok {
		return "", fmt.Errorf("secret key %q not found in %s/%s", key, namespace, secretName)
	}
	token := strings.TrimSpace(string(raw))
	if token == "" {
		return "", fmt.Errorf("secret %s/%s key %q is empty", namespace, secretName, key)
	}
	return token, nil
}

func (r *ProviderRegistry) buildMutualTLSConfig(ctx context.Context, target *ProviderTarget) (*tls.Config, error) {
	if strings.TrimSpace(target.ClientTLSSecret) == "" {
		return nil, fmt.Errorf("missing auth.clientTLSSecretRef.name for provider %s", target.Name)
	}

	var clientSecret corev1.Secret
	if err := r.k8s.Get(ctx, types.NamespacedName{Namespace: target.Namespace, Name: target.ClientTLSSecret}, &clientSecret); err != nil {
		return nil, fmt.Errorf("read clientTLS secret %s/%s: %w", target.Namespace, target.ClientTLSSecret, err)
	}
	certPEM, ok := clientSecret.Data["tls.crt"]
	if !ok || len(certPEM) == 0 {
		return nil, fmt.Errorf("clientTLS secret %s/%s missing tls.crt", target.Namespace, target.ClientTLSSecret)
	}
	keyPEM, ok := clientSecret.Data["tls.key"]
	if !ok || len(keyPEM) == 0 {
		return nil, fmt.Errorf("clientTLS secret %s/%s missing tls.key", target.Namespace, target.ClientTLSSecret)
	}
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("parse mTLS client keypair for %s: %w", target.Name, err)
	}

	cfg := &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{cert},
	}
	if strings.TrimSpace(target.CASecret) == "" {
		return cfg, nil
	}

	var caSecret corev1.Secret
	if err := r.k8s.Get(ctx, types.NamespacedName{Namespace: target.Namespace, Name: target.CASecret}, &caSecret); err != nil {
		return nil, fmt.Errorf("read CA secret %s/%s: %w", target.Namespace, target.CASecret, err)
	}
	caPEM := caSecret.Data["ca.crt"]
	if len(caPEM) == 0 {
		caPEM = caSecret.Data["tls.crt"]
	}
	if len(caPEM) == 0 {
		return nil, fmt.Errorf("CA secret %s/%s missing ca.crt/tls.crt", target.Namespace, target.CASecret)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("parse CA bundle from %s/%s failed", target.Namespace, target.CASecret)
	}
	cfg.RootCAs = pool
	return cfg, nil
}

func hasConditionTrue(status map[string]interface{}, condType string) bool {
	conds, found, _ := unstructured.NestedSlice(status, "conditions")
	if !found {
		return false
	}
	for _, item := range conds {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		t, _ := m["type"].(string)
		s, _ := m["status"].(string)
		if t == condType && strings.EqualFold(s, "True") {
			return true
		}
	}
	return false
}

func resolvedCapabilities(status map[string]interface{}) []string {
	out := make([]string, 0)
	caps, found, _ := unstructured.NestedSlice(status, "resolved", "capabilities")
	if !found {
		return out
	}
	for _, item := range caps {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func advertisedCapabilities(spec map[string]interface{}) []string {
	out := make([]string, 0)
	caps, found, _ := unstructured.NestedSlice(spec, "advertisedCapabilities")
	if !found {
		return out
	}
	for _, item := range caps {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if strings.EqualFold(item, target) {
			return true
		}
	}
	return false
}

func defaultInt64(value, fallback int64) int64 {
	if value > 0 {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func joinURLPath(basePath, p string) string {
	if p == "" {
		return basePath
	}
	if strings.HasPrefix(p, "/") {
		return p
	}
	if strings.HasSuffix(basePath, "/") {
		return basePath + p
	}
	if basePath == "" {
		return "/" + p
	}
	return basePath + "/" + p
}

func resolveProviderTargetOS(item unstructured.Unstructured, spec, status map[string]interface{}, providerID string) string {
	resolvedTargetOS, _, _ := unstructured.NestedString(status, "resolved", "targetOS")
	specTargetOS, _, _ := unstructured.NestedString(spec, "targetOS")
	specAnnotationTargetOS, _, _ := unstructured.NestedString(spec, "annotations", "epydios.ai/target-os")
	metaAnnotationTargetOS := item.GetAnnotations()["epydios.ai/target-os"]
	return firstNonEmpty(
		normalizeProviderTargetOS(resolvedTargetOS),
		normalizeProviderTargetOS(specTargetOS),
		normalizeProviderTargetOS(specAnnotationTargetOS),
		normalizeProviderTargetOS(metaAnnotationTargetOS),
		inferProviderTargetOSFromID(providerID, item.GetName()),
	)
}

func providerTargetOSMatches(providerTargetOS, requestedTargetOS string) bool {
	requestedTargetOS = normalizeProviderTargetOS(requestedTargetOS)
	if requestedTargetOS == "" {
		return true
	}
	providerTargetOS = normalizeProviderTargetOS(providerTargetOS)
	if providerTargetOS == "" {
		// Preserve Linux-first behavior for legacy desktop provider manifests that predate explicit target-os metadata.
		providerTargetOS = desktopOSLinux
	}
	return providerTargetOS == requestedTargetOS
}

func inferProviderTargetOSFromID(values ...string) string {
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
			continue
		}
		switch {
		case strings.Contains(normalized, "windows"):
			return desktopOSWindows
		case strings.Contains(normalized, "macos"), strings.Contains(normalized, "darwin"):
			return desktopOSMacOS
		case strings.Contains(normalized, "linux"):
			return desktopOSLinux
		}
	}
	return ""
}

func normalizeProviderTargetOS(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "any", "*":
		return ""
	case "linux":
		return desktopOSLinux
	case "windows", "win":
		return desktopOSWindows
	case "macos", "mac", "darwin", "osx":
		return desktopOSMacOS
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}
