//go:build windows

package nativeapp

import (
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

const detachedProcessCreationFlag = 0x00000008

func applyDetachedProcessAttributes(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | detachedProcessCreationFlag,
		HideWindow:    true,
	}
}

func processIsRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	cmd := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return bytes.Contains(output, []byte(","+strconv.Itoa(pid)+",")) || strings.Contains(string(output), strconv.Itoa(pid))
}

func stopRuntimeServiceByPID(pid int) error {
	if pid <= 0 {
		return nil
	}
	cmd := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("taskkill runtime service: %v: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}
