// Package server implements the HTTP server, routing, and request handlers.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/antispamapp/go-sync/internal/store"
	gosync "github.com/antispamapp/go-sync/internal/sync"
)

// Server holds all dependencies needed to handle requests.
type Server struct {
	pg      *store.PostgresStore
	redis   *store.RedisStore
	engine  *gosync.DeltaEngine
	startAt time.Time
	mux     *http.ServeMux
}

// New creates and configures the HTTP server.
func New(pg *store.PostgresStore, redis *store.RedisStore, engine *gosync.DeltaEngine) *Server {
	s := &Server{
		pg:      pg,
		redis:   redis,
		engine:  engine,
		startAt: time.Now(),
		mux:     http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /sync", s.handleSync)
	s.mux.HandleFunc("GET /lookup", s.handleLookup)
}

// ServeHTTP makes Server implement http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// Start starts listening on addr and blocks until ctx is done.
func (s *Server) Start(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr:         addr,
		Handler:      s,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("[server] Listening on %s", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutCtx)
	case err := <-errCh:
		return err
	}
}

// ── Handlers ────────────────────────────────────────────────────────────────────

// handleHealth returns service uptime and status.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"service":  "go-sync",
		"uptime_s": time.Since(s.startAt).Seconds(),
	})
}

// handleSync streams NDJSON delta records since a cursor.
// GET /sync?since=<id>&limit=<n>
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	sinceStr := r.URL.Query().Get("since")
	if sinceStr == "" {
		writeError(w, http.StatusBadRequest, "missing required query param: since")
		return
	}
	sinceID, err := strconv.ParseInt(sinceStr, 10, 64)
	if err != nil || sinceID < 0 {
		writeError(w, http.StatusBadRequest, "since must be a non-negative integer")
		return
	}

	limit := 10000
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 50000 {
			limit = l
		}
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering for streaming
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)
	count := 0

	err = s.pg.FetchDeltasSince(r.Context(), sinceID, limit, func(d store.SyncDelta) error {
		data, err := json.Marshal(d)
		if err != nil {
			return fmt.Errorf("marshalling delta: %w", err)
		}
		_, err = fmt.Fprintf(w, "%s\n", data)
		if err != nil {
			return fmt.Errorf("writing response: %w", err)
		}
		if canFlush {
			flusher.Flush()
		}
		// Apply to Redis in the background (best-effort)
		go func(delta store.SyncDelta) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if applyErr := s.engine.ApplyDelta(ctx, delta); applyErr != nil {
				log.Printf("[sync] Failed to apply delta %d to Redis: %v", delta.ID, applyErr)
			}
		}(d)
		count++
		return nil
	})

	if err != nil {
		log.Printf("[sync] Stream error after %d records: %v", count, err)
	}
}

// handleLookup performs a sub-millisecond bloom filter check with PostgreSQL fallback.
// GET /lookup?number=+14155552671
func (s *Server) handleLookup(w http.ResponseWriter, r *http.Request) {
	number := r.URL.Query().Get("number")
	if number == "" {
		writeError(w, http.StatusBadRequest, "missing required query param: number")
		return
	}

	// Validate E.164 format (basic)
	if len(number) < 8 || number[0] != '+' {
		writeError(w, http.StatusBadRequest, "number must be in E.164 format e.g. +14155552671")
		return
	}

	ctx := r.Context()

	// 1. Bloom filter check (sub-millisecond)
	mightBeSpam, err := s.redis.MightBeSpam(ctx, number)
	if err != nil {
		log.Printf("[lookup] Bloom filter error for %s: %v", number, err)
		// Fall through to PostgreSQL
	}

	if !mightBeSpam {
		// Definite negative (no false negatives possible)
		writeJSON(w, http.StatusOK, map[string]any{
			"phone_number": number,
			"is_spam":      false,
			"spam_score":   nil,
			"category":     nil,
			"source":       "bloom_filter",
		})
		return
	}

	// 2. Bloom says "maybe" — try score from sorted set (fast path)
	score, err := s.redis.GetNumberScore(ctx, number)
	if err == nil && score >= 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"phone_number": number,
			"is_spam":      true,
			"spam_score":   int(score),
			"category":     nil, // Category available in PG fallback
			"source":       "bloom_filter",
		})
		return
	}

	// 3. PostgreSQL fallback (false positive or score cache miss)
	record, err := s.pg.LookupNumber(ctx, number)
	if err != nil {
		log.Printf("[lookup] PG fallback error for %s: %v", number, err)
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}

	if record == nil {
		// Bloom false positive — number not in DB
		writeJSON(w, http.StatusOK, map[string]any{
			"phone_number": number,
			"is_spam":      false,
			"spam_score":   nil,
			"category":     nil,
			"source":       "postgres",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"phone_number": record.PhoneNumber,
		"is_spam":      true,
		"spam_score":   record.SpamScore,
		"category":     record.Category,
		"source":       "postgres",
	})
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}
