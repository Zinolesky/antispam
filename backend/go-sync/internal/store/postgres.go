// Package store provides PostgreSQL access for sync_deltas queries.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SyncDelta represents a single delta record from sync_deltas table.
type SyncDelta struct {
	ID          int64     `json:"id"`
	Operation   string    `json:"op"`
	PhoneNumber string    `json:"phone_number"`
	SpamScore   *int      `json:"spam_score,omitempty"`
	Category    *string   `json:"category,omitempty"`
	IsActive    *bool     `json:"is_active,omitempty"`
	CreatedAt   time.Time `json:"ts"`
}

// SpamNumberRecord is used for bloom filter pre-population.
type SpamNumberRecord struct {
	PhoneNumber string
	SpamScore   int
	Category    string
}

// PostgresStore wraps a pgx connection pool.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore creates and verifies a new connection pool.
func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}

	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creating pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return &PostgresStore{pool: pool}, nil
}

// Close releases all pool connections.
func (s *PostgresStore) Close() {
	s.pool.Close()
}

// FetchDeltasSince streams sync_deltas rows with id > sinceID.
// It calls rowFn for each row; returning an error aborts iteration.
func (s *PostgresStore) FetchDeltasSince(
	ctx context.Context,
	sinceID int64,
	limit int,
	rowFn func(SyncDelta) error,
) error {
	query := `
		SELECT id, operation, phone_number, spam_score, category, is_active, created_at
		FROM sync_deltas
		WHERE id > $1
		ORDER BY id ASC
		LIMIT $2
	`

	rows, err := s.pool.Query(ctx, query, sinceID, limit)
	if err != nil {
		return fmt.Errorf("querying sync_deltas: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var d SyncDelta
		err := rows.Scan(
			&d.ID, &d.Operation, &d.PhoneNumber,
			&d.SpamScore, &d.Category, &d.IsActive, &d.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("scanning row: %w", err)
		}
		if err := rowFn(d); err != nil {
			return err
		}
	}

	return rows.Err()
}

// FetchAllActiveNumbers loads all active spam numbers for bloom filter seeding.
func (s *PostgresStore) FetchAllActiveNumbers(ctx context.Context) ([]SpamNumberRecord, error) {
	query := `
		SELECT phone_number, spam_score, category
		FROM spam_numbers
		WHERE is_active = TRUE
		ORDER BY id ASC
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying spam_numbers: %w", err)
	}
	defer rows.Close()

	var records []SpamNumberRecord
	for rows.Next() {
		var r SpamNumberRecord
		if err := rows.Scan(&r.PhoneNumber, &r.SpamScore, &r.Category); err != nil {
			return nil, fmt.Errorf("scanning row: %w", err)
		}
		records = append(records, r)
	}

	return records, rows.Err()
}

// LookupNumber returns full details for a number from PostgreSQL (fallback after bloom miss).
func (s *PostgresStore) LookupNumber(ctx context.Context, phoneNumber string) (*SpamNumberRecord, error) {
	query := `
		SELECT phone_number, spam_score, category
		FROM spam_numbers
		WHERE phone_number = $1 AND is_active = TRUE
	`

	row := s.pool.QueryRow(ctx, query, phoneNumber)
	var r SpamNumberRecord
	err := row.Scan(&r.PhoneNumber, &r.SpamScore, &r.Category)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("looking up number: %w", err)
	}
	return &r, nil
}
