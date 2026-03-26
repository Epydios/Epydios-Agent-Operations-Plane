package runtimeclient

import (
	"context"
	"fmt"
	"sort"
	"strings"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type TaskAnnotationLookup struct {
	TaskID               string
	RequiredAnnotations  map[string]string
	CaseInsensitiveKeys  map[string]bool
	MissingLookupMessage string
	NotFoundMessage      string
}

type PendingTargetItem struct {
	ID    string
	Label string
}

type PendingTargetLookup struct {
	SessionID         string
	FallbackSessionID string
	ExplicitTargetID  string
	TargetSingular    string
	TargetPlural      string
	ContextLabel      string
	ExplicitFlag      string
	Items             []PendingTargetItem
}

type ContextHintPart struct {
	Flag  string
	Value string
}

type DecisionActionHints struct {
	ContextHint     string
	ApprovalCommand string
	ProposalCommand string
	ApprovalIDs     []string
	ProposalIDs     []string
}

func ResolveTaskByAnnotationLookup(ctx context.Context, client *Client, lookup TaskAnnotationLookup) (*runtimeapi.TaskRecord, error) {
	if strings.TrimSpace(lookup.TaskID) != "" {
		return client.GetTask(ctx, lookup.TaskID)
	}
	if !hasRequiredAnnotationValue(lookup.RequiredAnnotations) {
		return nil, fmt.Errorf("%s", NormalizeStringOrDefault(lookup.MissingLookupMessage, "a task id or context lookup is required"))
	}
	if err := client.RequireScope(); err != nil {
		return nil, err
	}
	const limit = 100
	const maxPages = 20
	matches := make([]runtimeapi.TaskRecord, 0)
	for page := 0; page < maxPages; page++ {
		offset := page * limit
		response, err := client.ListTasks(ctx, limit, offset, "", "")
		if err != nil {
			return nil, err
		}
		if len(response.Items) == 0 {
			break
		}
		for _, task := range response.Items {
			if MatchesTaskAnnotationLookup(task, lookup) {
				matches = append(matches, task)
			}
		}
		if offset+len(response.Items) >= response.Count {
			break
		}
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("%s", NormalizeStringOrDefault(lookup.NotFoundMessage, "no task matched the provided context"))
	}
	sort.SliceStable(matches, func(i, j int) bool {
		return matches[j].UpdatedAt.Before(matches[i].UpdatedAt)
	})
	return &matches[0], nil
}

func ResolvePendingTarget(lookup PendingTargetLookup) (string, string, error) {
	targetSingular := NormalizeStringOrDefault(lookup.TargetSingular, "target")
	targetPlural := NormalizeStringOrDefault(lookup.TargetPlural, targetSingular+"s")
	contextLabel := NormalizeStringOrDefault(lookup.ContextLabel, "context")
	explicitFlag := NormalizeStringOrDefault(lookup.ExplicitFlag, "id")
	resolvedSessionID := strings.TrimSpace(NormalizeStringOrDefault(lookup.SessionID, lookup.FallbackSessionID))
	resolvedTargetID := strings.TrimSpace(lookup.ExplicitTargetID)
	if resolvedSessionID == "" {
		return "", "", fmt.Errorf("no session available to resolve %s decision target", targetSingular)
	}
	if resolvedTargetID != "" {
		return resolvedSessionID, resolvedTargetID, nil
	}
	switch len(lookup.Items) {
	case 0:
		return "", "", fmt.Errorf("no pending %s were found for the resolved %s", targetPlural, contextLabel)
	case 1:
		return resolvedSessionID, strings.TrimSpace(lookup.Items[0].ID), nil
	default:
		labels := make([]string, 0, len(lookup.Items))
		for _, item := range lookup.Items {
			label := NormalizeStringOrDefault(item.ID, item.Label)
			if label != "" {
				labels = append(labels, label)
			}
		}
		return "", "", fmt.Errorf("multiple pending %s matched the %s; the current %s is not unambiguous, so rerun with --%s (%s)", targetPlural, contextLabel, targetSingular, explicitFlag, strings.Join(labels, ", "))
	}
}

func BuildContextHint(fallbackTaskID string, parts ...ContextHintPart) string {
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		flagName := strings.TrimSpace(part.Flag)
		value := strings.TrimSpace(part.Value)
		if flagName == "" || value == "" {
			continue
		}
		values = append(values, fmt.Sprintf("--%s %s", flagName, value))
	}
	if len(values) > 0 {
		return strings.Join(values, " ")
	}
	if trimmed := strings.TrimSpace(fallbackTaskID); trimmed != "" {
		return "--task-id " + trimmed
	}
	return "--task-id <taskId>"
}

func RenderDecisionActionHints(spec DecisionActionHints) []string {
	contextHint := strings.TrimSpace(spec.ContextHint)
	if contextHint == "" {
		contextHint = "--task-id <taskId>"
	}
	approvalCommand := NormalizeStringOrDefault(spec.ApprovalCommand, "approvals decide")
	proposalCommand := NormalizeStringOrDefault(spec.ProposalCommand, "proposals decide")
	lines := make([]string, 0, 4)
	switch len(spec.ApprovalIDs) {
	case 1:
		lines = append(lines, fmt.Sprintf("- Current approval is focused automatically: %s %s --decision APPROVE|DENY", approvalCommand, contextHint))
		lines = append(lines, fmt.Sprintf("- Secondary path: %s %s --checkpoint-id %s --decision APPROVE|DENY", approvalCommand, contextHint, spec.ApprovalIDs[0]))
	default:
		if len(spec.ApprovalIDs) > 1 {
			lines = append(lines, fmt.Sprintf("- Current approval is not unambiguous: %s %s --checkpoint-id <id> --decision APPROVE|DENY", approvalCommand, contextHint))
			lines = append(lines, fmt.Sprintf("- Secondary approval IDs: %s", strings.Join(spec.ApprovalIDs, ", ")))
		}
	}
	switch len(spec.ProposalIDs) {
	case 1:
		lines = append(lines, fmt.Sprintf("- Current proposal is focused automatically: %s %s --decision APPROVE|DENY", proposalCommand, contextHint))
		lines = append(lines, fmt.Sprintf("- Secondary path: %s %s --proposal-id %s --decision APPROVE|DENY", proposalCommand, contextHint, spec.ProposalIDs[0]))
	default:
		if len(spec.ProposalIDs) > 1 {
			lines = append(lines, fmt.Sprintf("- Current proposal is not unambiguous: %s %s --proposal-id <id> --decision APPROVE|DENY", proposalCommand, contextHint))
			lines = append(lines, fmt.Sprintf("- Secondary proposal IDs: %s", strings.Join(spec.ProposalIDs, ", ")))
		}
	}
	return lines
}

func MatchesTaskAnnotationLookup(task runtimeapi.TaskRecord, lookup TaskAnnotationLookup) bool {
	annotations := rawObject(task.Annotations)
	for key, expected := range lookup.RequiredAnnotations {
		expected = strings.TrimSpace(expected)
		if expected == "" {
			continue
		}
		actual := normalizeInterfaceString(annotations[key], "")
		if lookup.CaseInsensitiveKeys != nil && lookup.CaseInsensitiveKeys[key] {
			if !strings.EqualFold(actual, expected) {
				return false
			}
			continue
		}
		if actual != expected {
			return false
		}
	}
	return true
}

func hasRequiredAnnotationValue(values map[string]string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return true
		}
	}
	return false
}
