package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/Epydios/Epydios-AgentOps-Control-Plane/ui/desktop-ui/internal/nativeapp"
)

func main() {
	if len(os.Args) < 2 {
		fatalf("usage: nativeapp_verifier_helper <list-holds|resolve-hold> [flags]")
	}
	switch os.Args[1] {
	case "list-holds":
		runListHolds(os.Args[2:])
	case "resolve-hold":
		runResolveHold(os.Args[2:])
	default:
		fatalf("unknown subcommand %q", os.Args[1])
	}
}

func runListHolds(args []string) {
	fs := flag.NewFlagSet("list-holds", flag.ExitOnError)
	holdsRoot := fs.String("holds-root", "", "path to the gateway holds root")
	fs.Parse(args)
	if *holdsRoot == "" {
		fatalf("list-holds requires --holds-root")
	}
	items, err := nativeapp.ListGatewayHoldRecords(*holdsRoot)
	if err != nil {
		fatalf("list holds: %v", err)
	}
	writeJSON(items)
}

func runResolveHold(args []string) {
	fs := flag.NewFlagSet("resolve-hold", flag.ExitOnError)
	holdsRoot := fs.String("holds-root", "", "path to the gateway holds root")
	requestsRoot := fs.String("requests-root", "", "path to the gateway requests root")
	interpositionRequestID := fs.String("interposition-request-id", "", "interposition request id to resolve")
	decision := fs.String("decision", "APPROVE", "APPROVE or DENY")
	reason := fs.String("reason", "", "resolution reason")
	fs.Parse(args)
	if *holdsRoot == "" {
		fatalf("resolve-hold requires --holds-root")
	}
	if *requestsRoot == "" {
		fatalf("resolve-hold requires --requests-root")
	}
	if *interpositionRequestID == "" {
		fatalf("resolve-hold requires --interposition-request-id")
	}
	record, err := nativeapp.ResolveGatewayHoldRecord(*holdsRoot, *requestsRoot, *interpositionRequestID, *decision, *reason)
	if err != nil {
		fatalf("resolve hold: %v", err)
	}
	writeJSON(record)
}

func writeJSON(value any) {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fatalf("encode json: %v", err)
	}
	if _, err := os.Stdout.Write(append(encoded, '\n')); err != nil {
		fatalf("write json: %v", err)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
