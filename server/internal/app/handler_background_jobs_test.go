package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"infosphere/server/internal/config"
	"infosphere/server/internal/jobqueue"
	"infosphere/server/internal/models"
)

func TestAdminBackgroundJobs(t *testing.T) {
	t.Setenv("INFO_SPHERE_DATA", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	a, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.Router())
	defer server.Close()

	request := func(method, path string, body any, token string) (int, map[string]any) {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		payload := map[string]any{}
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}

	_, installed := request(http.MethodPost, "/api/v1/setup/install", map[string]any{
		"database": map[string]any{"type": "sqlite"},
		"site":     map[string]any{"name": "任务测试站"},
		"admin":    map[string]any{"username": "admin", "email": "admin@test.local", "password": "secret123"},
	}, "")
	adminToken := installed["data"].(map[string]any)["token"].(string)
	_, registered := request(http.MethodPost, "/api/v1/auth/register", map[string]any{
		"username": "alice", "email": "alice@test.local", "password": "secret123",
	}, "")
	userToken := registered["data"].(map[string]any)["token"].(string)

	if status, _ := request(http.MethodGet, "/api/v1/admin/tasks", nil, ""); status != http.StatusUnauthorized {
		t.Fatalf("anonymous task list should be 401: %d", status)
	}
	if status, _ := request(http.MethodGet, "/api/v1/admin/tasks", nil, userToken); status != http.StatusForbidden {
		t.Fatalf("regular user task list should be 403: %d", status)
	}

	now := time.Now()
	job := models.BackgroundJob{
		Type: emailSendJobType, Payload: "must-not-leak@example.com", Status: jobqueue.StatusFailed,
		Attempts: 5, MaxAttempts: 5, AvailableAt: now, LastError: "SMTP unavailable",
		FinishedAt: &now, CreatedAt: now, UpdatedAt: now,
	}
	if err := a.DB.Create(&job).Error; err != nil {
		t.Fatal(err)
	}

	status, listed := request(http.MethodGet, "/api/v1/admin/tasks?status=failed&type=email.send", nil, adminToken)
	if status != http.StatusOK {
		t.Fatalf("list tasks failed: %d %v", status, listed)
	}
	data := listed["data"].(map[string]any)
	items := data["items"].([]any)
	if len(items) != 1 || data["total"] != float64(1) {
		t.Fatalf("unexpected task list: %v", data)
	}
	encoded, _ := json.Marshal(listed)
	if strings.Contains(string(encoded), "must-not-leak@example.com") || strings.Contains(string(encoded), "payload") {
		t.Fatalf("task payload leaked from admin API: %s", encoded)
	}

	path := "/api/v1/admin/tasks/" + strconv.FormatUint(uint64(job.ID), 10) + "/retry"
	if status, payload := request(http.MethodPost, path, nil, adminToken); status != http.StatusOK {
		t.Fatalf("retry task failed: %d %v", status, payload)
	}
	if status, _ := request(http.MethodPost, path, nil, adminToken); status != http.StatusConflict {
		t.Fatalf("task must not be queued twice: %d", status)
	}
	var updated models.BackgroundJob
	if err := a.DB.First(&updated, job.ID).Error; err != nil {
		t.Fatal(err)
	}
	if updated.Status != jobqueue.StatusPending || updated.Attempts != 0 || updated.LastError != "" {
		t.Fatalf("unexpected retried task: %+v", updated)
	}
	var audit models.AuditLog
	if err := a.DB.Where("action = ? AND resource_id = ?", "task.retried", strconv.FormatUint(uint64(job.ID), 10)).First(&audit).Error; err != nil {
		t.Fatalf("retry audit missing: %v", err)
	}

	if status, _ := request(http.MethodGet, "/api/v1/admin/tasks?status=unknown", nil, adminToken); status != http.StatusBadRequest {
		t.Fatalf("invalid task status should be 400: %d", status)
	}
}
