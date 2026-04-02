package runtime

import (
	"encoding/json"
	"strings"
)

type managedWorkerEvent struct {
	Type     string     `json:"type,omitempty"`
	ItemType string     `json:"itemType,omitempty"`
	Text     string     `json:"text,omitempty"`
	Command  string     `json:"command,omitempty"`
	Output   string     `json:"output,omitempty"`
	Status   string     `json:"status,omitempty"`
	ExitCode *int       `json:"exitCode,omitempty"`
	Usage    JSONObject `json:"usage,omitempty"`
}

type managedWorkerTurnEnvelope struct {
	operatorMessage string
	finishReason    string
	usage           JSONObject
	rawResponse     json.RawMessage
	outputChunks    []string
	toolProposals   []JSONObject
	events          []managedWorkerEvent
	sourceMode      string
}

func applyManagedWorkerTurnEnvelope(base *invokeResult, turn *managedWorkerTurnEnvelope) *invokeResult {
	if turn == nil {
		return base
	}
	if base == nil {
		base = &invokeResult{}
	}
	if strings.TrimSpace(turn.operatorMessage) != "" {
		base.outputText = turn.operatorMessage
	}
	if strings.TrimSpace(turn.finishReason) != "" {
		base.finishReason = turn.finishReason
	}
	if len(turn.usage) > 0 {
		base.usage = turn.usage
	}
	if len(turn.rawResponse) > 0 {
		base.rawResponse = append(json.RawMessage(nil), turn.rawResponse...)
	} else if len(turn.events) > 0 {
		if encoded, err := json.Marshal(turn.events); err == nil {
			base.rawResponse = encoded
		}
	}
	base.workerOutputChunks = append([]string(nil), turn.outputChunks...)
	base.toolProposals = append([]JSONObject(nil), turn.toolProposals...)
	return base
}
