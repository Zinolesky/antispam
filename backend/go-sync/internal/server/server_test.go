package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthAndValidationHandlers(t *testing.T) {
	srv := New(nil, nil, nil)

	// 1. GET /health
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /health, got %d", rec.Code)
	}
	var healthBody map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &healthBody); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if healthBody["status"] != "ok" || healthBody["service"] != "go-sync" {
		t.Fatalf("unexpected health payload: %+v", healthBody)
	}

	// 2. GET /sync without since parameter -> 400
	reqSyncMissing := httptest.NewRequest(http.MethodGet, "/sync", nil)
	recSyncMissing := httptest.NewRecorder()
	srv.ServeHTTP(recSyncMissing, reqSyncMissing)
	if recSyncMissing.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing since param, got %d", recSyncMissing.Code)
	}

	// 3. GET /sync with negative since parameter -> 400
	reqSyncNeg := httptest.NewRequest(http.MethodGet, "/sync?since=-5", nil)
	recSyncNeg := httptest.NewRecorder()
	srv.ServeHTTP(recSyncNeg, reqSyncNeg)
	if recSyncNeg.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative since param, got %d", recSyncNeg.Code)
	}

	// 4. GET /lookup without number parameter -> 400
	reqLookupMissing := httptest.NewRequest(http.MethodGet, "/lookup", nil)
	recLookupMissing := httptest.NewRecorder()
	srv.ServeHTTP(recLookupMissing, reqLookupMissing)
	if recLookupMissing.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing number param, got %d", recLookupMissing.Code)
	}

	// 5. GET /lookup with non-E.164 number -> 400
	reqLookupInvalid := httptest.NewRequest(http.MethodGet, "/lookup?number=12345", nil)
	recLookupInvalid := httptest.NewRecorder()
	srv.ServeHTTP(recLookupInvalid, reqLookupInvalid)
	if recLookupInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid E.164 number, got %d", recLookupInvalid.Code)
	}
}
