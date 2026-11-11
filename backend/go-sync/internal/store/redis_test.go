package store

import "testing"

func TestBloomParamsAndOffsets(t *testing.T) {
	m, k := bloomParams(1000000, 0.001)
	if m == 0 || k == 0 {
		t.Fatalf("expected non-zero bloom params, got m=%d k=%d", m, k)
	}

	r := &RedisStore{
		capacity:   1000000,
		errorRate:  0.001,
		bitSetSize: m,
		hashCount:  k,
	}

	offsets1 := r.bloomOffsets("+14155552671")
	offsets2 := r.bloomOffsets("+14155552671")
	if len(offsets1) != int(k) {
		t.Fatalf("expected %d offsets, got %d", k, len(offsets1))
	}
	for i := range offsets1 {
		if offsets1[i] != offsets2[i] {
			t.Fatalf("expected deterministic offsets at index %d", i)
		}
		if offsets1[i] >= m {
			t.Fatalf("offset %d out of bounds (m=%d)", offsets1[i], m)
		}
	}
}
