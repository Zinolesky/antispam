// Package sync handles delta streaming and bloom filter population.
package sync

import (
	"context"
	"log"

	"github.com/antispamapp/go-sync/internal/store"
)

// DeltaEngine manages bloom filter seeding and delta application.
type DeltaEngine struct {
	pg    *store.PostgresStore
	redis *store.RedisStore
}

// NewDeltaEngine creates a DeltaEngine.
func NewDeltaEngine(pg *store.PostgresStore, redis *store.RedisStore) *DeltaEngine {
	return &DeltaEngine{pg: pg, redis: redis}
}

// SeedBloomFilter loads all active spam numbers from PostgreSQL into the Redis bloom filter.
// Called once on startup. This is idempotent — re-seeding is safe.
func (e *DeltaEngine) SeedBloomFilter(ctx context.Context) error {
	log.Println("[seed] Loading active spam numbers into bloom filter...")
	records, err := e.pg.FetchAllActiveNumbers(ctx)
	if err != nil {
		return err
	}

	for _, r := range records {
		if err := e.redis.AddToBloom(ctx, r.PhoneNumber); err != nil {
			log.Printf("[seed] Failed to add %s to bloom: %v", r.PhoneNumber, err)
			continue
		}
		if err := e.redis.SetNumberScore(ctx, r.PhoneNumber, float64(r.SpamScore)); err != nil {
			log.Printf("[seed] Failed to set score for %s: %v", r.PhoneNumber, err)
		}
	}

	log.Printf("[seed] Seeded bloom filter with %d spam numbers", len(records))
	return nil
}

// ApplyDelta applies a single sync delta to the bloom filter and sorted set.
// Called after streaming a delta to keep Redis consistent with PostgreSQL.
func (e *DeltaEngine) ApplyDelta(ctx context.Context, d store.SyncDelta) error {
	switch d.Operation {
	case "I", "U":
		if err := e.redis.AddToBloom(ctx, d.PhoneNumber); err != nil {
			return err
		}
		if d.SpamScore != nil && d.IsActive != nil && *d.IsActive {
			return e.redis.SetNumberScore(ctx, d.PhoneNumber, float64(*d.SpamScore))
		}
		if d.IsActive != nil && !*d.IsActive {
			// Deactivated — remove from sorted set (bloom cannot be un-set)
			return e.redis.RemoveNumber(ctx, d.PhoneNumber)
		}
	case "D":
		return e.redis.RemoveNumber(ctx, d.PhoneNumber)
	}
	return nil
}
