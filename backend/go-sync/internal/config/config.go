// Package config loads service configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the go-sync service.
type Config struct {
	DatabaseURL    string
	RedisURL       string
	Port           string
	BloomCapacity  uint
	BloomErrorRate float64
	LogLevel       string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://antispam:changeme_dev@localhost:5432/antispam"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		Port:           getEnv("PORT", "8080"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
	}

	capacity, err := strconv.ParseUint(getEnv("BLOOM_CAPACITY", "10000000"), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid BLOOM_CAPACITY: %w", err)
	}
	cfg.BloomCapacity = uint(capacity)

	errorRate, err := strconv.ParseFloat(getEnv("BLOOM_ERROR_RATE", "0.001"), 64)
	if err != nil {
		return nil, fmt.Errorf("invalid BLOOM_ERROR_RATE: %w", err)
	}
	cfg.BloomErrorRate = errorRate

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
