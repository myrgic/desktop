package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Service labels
const (
	KernelLabel = "com.cogos.kernel"
	DefaultPort = 5200 // fallback only — prefer reading from workspace config
)

// ServiceStatus represents the status of a managed service
type ServiceStatus struct {
	Name     string `json:"name"`
	Label    string `json:"label"`
	Port     int    `json:"port"`
	Running  bool   `json:"running"`
	Healthy  bool   `json:"healthy"`
	Launchd  bool   `json:"launchd"`
	PID      *int   `json:"pid"`
	ExitCode *int   `json:"exitCode"`
}

// App struct - the main application
type App struct {
	ctx           context.Context
	workspaceRoot string
	kernelPort    int
	terminal      *TerminalManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	app := &App{}
	app.terminal = NewTerminalManager(app)
	return app
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.workspaceRoot = a.findWorkspaceRoot()
	a.kernelPort = a.resolveKernelPort()
}

// resolveKernelPort reads the port from workspace config, falling back to default.
func (a *App) resolveKernelPort() int {
	if a.workspaceRoot == "" {
		return DefaultPort
	}
	// Read from .cog/config/kernel.yaml
	configPath := filepath.Join(a.workspaceRoot, ".cog", "config", "kernel.yaml")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return DefaultPort
	}
	// Simple YAML parsing for port field — avoids yaml dependency
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "port:") {
			val := strings.TrimSpace(strings.TrimPrefix(line, "port:"))
			if p, err := strconv.Atoi(val); err == nil && p > 0 {
				return p
			}
		}
	}
	return DefaultPort
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	if a.terminal != nil {
		a.terminal.CloseAll()
	}
}

// === TERMINAL METHODS ===

// StartTerminal starts a new terminal session
func (a *App) StartTerminal(id string) error {
	return a.terminal.StartSession(id, "", "")
}

// WriteTerminal writes to a terminal session
func (a *App) WriteTerminal(id string, data string) error {
	return a.terminal.WriteToSession(id, data)
}

// ResizeTerminal resizes a terminal session
func (a *App) ResizeTerminal(id string, cols int, rows int) error {
	return a.terminal.ResizeSession(id, uint16(cols), uint16(rows))
}

// CloseTerminal closes a terminal session
func (a *App) CloseTerminal(id string) error {
	return a.terminal.CloseSession(id)
}

// findWorkspaceRoot locates the CogOS workspace
func (a *App) findWorkspaceRoot() string {
	// Check common locations
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "workspace"),
		filepath.Join(home, "cog-workspace"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(filepath.Join(path, ".cog")); err == nil {
			return path
		}
	}

	// Try current directory
	cwd, _ := os.Getwd()
	if _, err := os.Stat(filepath.Join(cwd, ".cog")); err == nil {
		return cwd
	}

	return ""
}

// GetWorkspaceRoot returns the workspace root path
func (a *App) GetWorkspaceRoot() string {
	return a.workspaceRoot
}

// GetServices returns the status of all managed services
// Now only returns kernel status (cog-chat service retired)
func (a *App) GetServices() []ServiceStatus {
	services := []struct {
		name   string
		label  string
		port   int
		health string
	}{
		{"kernel", KernelLabel, a.kernelPort, fmt.Sprintf("http://localhost:%d/health", a.kernelPort)},
	}

	result := make([]ServiceStatus, 0)

	for _, svc := range services {
		status := ServiceStatus{
			Name:    svc.name,
			Label:   svc.label,
			Port:    svc.port,
			Running: false,
			Healthy: false,
			Launchd: false,
		}

		// Check launchd status
		cmd := exec.Command("launchctl", "list", svc.label)
		output, err := cmd.Output()
		if err == nil {
			status.Launchd = true
			// Parse output: "PID\tStatus\tLabel"
			lines := strings.Split(string(output), "\n")
			if len(lines) > 0 {
				fields := strings.Fields(lines[0])
				if len(fields) >= 2 {
					if pid, err := strconv.Atoi(fields[0]); err == nil && pid > 0 {
						status.PID = &pid
						status.Running = true
					}
					if exitCode, err := strconv.Atoi(fields[1]); err == nil {
						status.ExitCode = &exitCode
					}
				}
			}
		}

		// Check health endpoint
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get(svc.health)
		if err == nil {
			status.Healthy = resp.StatusCode == http.StatusOK
			resp.Body.Close()
			status.Running = true
		}

		result = append(result, status)
	}

	return result
}

// RestartService restarts a service via launchctl
func (a *App) RestartService(serviceName string) (bool, string) {
	labels := map[string]string{
		"kernel": KernelLabel,
	}

	label, ok := labels[serviceName]
	if !ok {
		return false, "Unknown service: " + serviceName
	}

	uid := os.Getuid()
	cmd := exec.Command("launchctl", "kickstart", "-k", fmt.Sprintf("gui/%d/%s", uid, label))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Sprintf("Failed to restart: %s - %s", err.Error(), string(output))
	}

	return true, "Service restarted"
}

// StartService starts a service via launchctl
func (a *App) StartService(serviceName string) (bool, string) {
	labels := map[string]string{
		"kernel": KernelLabel,
	}

	label, ok := labels[serviceName]
	if !ok {
		return false, "Unknown service: " + serviceName
	}

	uid := os.Getuid()
	cmd := exec.Command("launchctl", "kickstart", fmt.Sprintf("gui/%d/%s", uid, label))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Sprintf("Failed to start: %s - %s", err.Error(), string(output))
	}

	return true, "Service started"
}

// StopService stops a service via launchctl
func (a *App) StopService(serviceName string) (bool, string) {
	labels := map[string]string{
		"kernel": KernelLabel,
	}

	label, ok := labels[serviceName]
	if !ok {
		return false, "Unknown service: " + serviceName
	}

	uid := os.Getuid()
	cmd := exec.Command("launchctl", "kill", "SIGTERM", fmt.Sprintf("gui/%d/%s", uid, label))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Sprintf("Failed to stop: %s - %s", err.Error(), string(output))
	}

	return true, "Service stopped"
}

// EnableService registers a service with launchd
func (a *App) EnableService(serviceName string) (bool, string) {
	if a.workspaceRoot == "" {
		return false, "Workspace not found"
	}

	switch serviceName {
	case "kernel":
		// Use the kernel's built-in enable command
		cmd := exec.Command(filepath.Join(a.workspaceRoot, ".cog", "cog"), "serve", "enable")
		cmd.Dir = a.workspaceRoot
		output, err := cmd.CombinedOutput()
		if err != nil {
			return false, fmt.Sprintf("Failed to enable: %s - %s", err.Error(), string(output))
		}
		return true, "Kernel enabled for auto-start"

	default:
		return false, "Unknown service: " + serviceName
	}
}

// GetKernelHealth fetches health info from the kernel
func (a *App) GetKernelHealth() map[string]interface{} {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://localhost:%d/health", a.kernelPort))
	if err != nil {
		return map[string]interface{}{
			"status": "unreachable",
			"error":  err.Error(),
		}
	}
	defer resp.Body.Close()

	var health map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return map[string]interface{}{
			"status": "error",
			"error":  err.Error(),
		}
	}

	return health
}

// GetKernelStatus fetches raw status JSON from the kernel health endpoint.
func (a *App) GetKernelStatus() (string, error) {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://localhost:%d/health", a.kernelPort))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("kernel health request failed with status %d", resp.StatusCode)
	}

	if !json.Valid(body) {
		return "", fmt.Errorf("kernel health response is not valid JSON")
	}

	return string(body), nil
}
