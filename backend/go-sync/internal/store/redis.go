// Package store provides Redis-backed bloom filter for sub-millisecond spam lookups.
package store

import (
	"context"
	"fmt"
	"math"

	"github.com/redis/go-redis/v9"
)

const (
	bloomKey    = "antispam:bloom"
	numberSetKey = "antispam:numbers" // Sorted set: number -> spam_score
)

// RedisStore wraps a redis client for bloom filter and exact lookups.
type RedisStore struct {
	client *redis.Client
	// Bloom filter parameters (for manual Murmur-hash based implementation)
	capacity   uint
	errorRate  float64
	bitSetSize uint
	hashCount  uint
}

// NewRedisStore creates a Redis client and validates connectivity.
func NewRedisStore(ctx context.Context, redisURL string, capacity uint, errorRate float64) (*RedisStore, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parsing redis URL: %w", err)
	}

	opts.PoolSize = 50
	opts.MinIdleConns = 5

	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("pinging redis: %w", err)
	}

	bitSetSize, hashCount := bloomParams(capacity, errorRate)

	return &RedisStore{
		client:     client,
		capacity:   capacity,
		errorRate:  errorRate,
		bitSetSize: bitSetSize,
		hashCount:  hashCount,
	}, nil
}

// Close closes the Redis connection.
func (r *RedisStore) Close() error {
	return r.client.Close()
}

// AddToBloom adds a phone number to the Redis bloom filter bit array.
func (r *RedisStore) AddToBloom(ctx context.Context, phoneNumber string) error {
	offsets := r.bloomOffsets(phoneNumber)
	pipe := r.client.Pipeline()
	for _, offset := range offsets {
		pipe.SetBit(ctx, bloomKey, int64(offset), 1)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// MightBeSpam returns true if the number is possibly in the bloom filter.
// False negatives are impossible; false positives occur at configured error rate.
func (r *RedisStore) MightBeSpam(ctx context.Context, phoneNumber string) (bool, error) {
	offsets := r.bloomOffsets(phoneNumber)
	pipe := r.client.Pipeline()
	cmds := make([]*redis.IntCmd, len(offsets))
	for i, offset := range offsets {
		cmds[i] = pipe.GetBit(ctx, bloomKey, int64(offset))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return false, err
	}
	for _, cmd := range cmds {
		if cmd.Val() == 0 {
			return false, nil
		}
	}
	return true, nil
}

// SetNumberScore caches a spam score in a Redis sorted set (for fast score retrieval).
func (r *RedisStore) SetNumberScore(ctx context.Context, phoneNumber string, score float64) error {
	return r.client.ZAdd(ctx, numberSetKey, redis.Z{
		Score:  score,
		Member: phoneNumber,
	}).Err()
}

// RemoveNumber removes a phone number from the sorted set (bloom can't be undone, only PG is authoritative).
func (r *RedisStore) RemoveNumber(ctx context.Context, phoneNumber string) error {
	return r.client.ZRem(ctx, numberSetKey, phoneNumber).Err()
}

// GetNumberScore retrieves the cached spam score, returns -1 if not found.
func (r *RedisStore) GetNumberScore(ctx context.Context, phoneNumber string) (float64, error) {
	score, err := r.client.ZScore(ctx, numberSetKey, phoneNumber).Result()
	if err == redis.Nil {
		return -1, nil
	}
	return score, err
}

// ── Bloom filter internals ─────────────────────────────────────────────────────

// bloomParams computes the optimal bit array size (m) and number of hash functions (k).
func bloomParams(n uint, p float64) (m uint, k uint) {
	ln2 := math.Log(2)
	mf := -float64(n) * math.Log(p) / (ln2 * ln2)
	m = uint(math.Ceil(mf))
	kf := (float64(m) / float64(n)) * ln2
	k = uint(math.Round(kf))
	return m, k
}

// bloomOffsets computes k bit positions for a given key using double hashing.
// Uses FNV-1a as h1 and a simple polynomial hash as h2.
func (r *RedisStore) bloomOffsets(key string) []uint {
	h1 := fnv1a(key)
	h2 := polynomial(key)
	offsets := make([]uint, r.hashCount)
	for i := uint(0); i < r.hashCount; i++ {
		offsets[i] = (h1 + i*h2) % r.bitSetSize
	}
	return offsets
}

func fnv1a(s string) uint {
	const (
		offset = uint(2166136261)
		prime  = uint(16777619)
	)
	h := offset
	for i := 0; i < len(s); i++ {
		h ^= uint(s[i])
		h *= prime
	}
	return h
}

func polynomial(s string) uint {
	const base = uint(31)
	h := uint(0)
	for i := 0; i < len(s); i++ {
		h = h*base + uint(s[i])
	}
	if h == 0 {
		return 1
	}
	return h
}
