// Command server is the entrypoint for the go-sync service.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/antispamapp/go-sync/internal/config"
	"github.com/antispamapp/go-sync/internal/server"
	"github.com/antispamapp/go-sync/internal/store"
	gosync "github.com/antispamapp/go-sync/internal/sync"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Connect to PostgreSQL ───────────────────────────────────────────────────
	pg, err := store.NewPostgresStore(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer pg.Close()
	log.Println("[main] Connected to PostgreSQL")

	// ── Connect to Redis ────────────────────────────────────────────────────────
	redis, err := store.NewRedisStore(ctx, cfg.RedisURL, cfg.BloomCapacity, cfg.BloomErrorRate)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redis.Close()
	log.Println("[main] Connected to Redis")

	// ── Seed bloom filter from PostgreSQL ───────────────────────────────────────
	engine := gosync.NewDeltaEngine(pg, redis)
	if err := engine.SeedBloomFilter(ctx); err != nil {
		log.Fatalf("Failed to seed bloom filter: %v", err)
	}

	// ── Start HTTP server ───────────────────────────────────────────────────────
	srv := server.New(pg, redis, engine)
	addr := ":" + cfg.Port

	if err := srv.Start(ctx, addr); err != nil {
		log.Printf("[main] Server stopped: %v", err)
	}
	log.Println("[main] Shutdown complete")
}
