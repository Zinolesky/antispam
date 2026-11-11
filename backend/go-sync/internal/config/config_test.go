package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("BLOOM_CAPACITY")
	os.Unsetenv("BLOOM_ERROR_RATE")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("expected default port 8080, got %s", cfg.Port)
	}
	if cfg.BloomCapacity != 10000000 {
		t.Errorf("expected default BloomCapacity 10000000, got %d", cfg.BloomCapacity)
	}
	if cfg.BloomErrorRate != 0.001 {
		t.Errorf("expected default BloomErrorRate 0.001, got %f", cfg.BloomErrorRate)
	}
}

func TestLoadCustomAndInvalidEnv(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("BLOOM_CAPACITY", "50000")
	t.Setenv("BLOOM_ERROR_RATE", "0.01")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.Port != "9090" || cfg.BloomCapacity != 50000 || cfg.BloomErrorRate != 0.01 {
		t.Fatalf("unexpected config values: %+v", cfg)
	}

	t.Setenv("BLOOM_CAPACITY", "not-a-number")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid BLOOM_CAPACITY")
	}
}
