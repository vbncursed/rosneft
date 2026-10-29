//go:build integration

// Package redistest starts a throwaway Redis for integration tests.
package redistest

import (
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"gotest.tools/v3/assert"
)

// Client returns a client on a fresh Redis container, removed with the test.
func Client(t *testing.T) *redis.Client {
	t.Helper()
	ctr, err := tcredis.Run(t.Context(), "redis:8.2")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	uri, err := ctr.ConnectionString(t.Context())
	assert.NilError(t, err)
	opts, err := redis.ParseURL(uri)
	assert.NilError(t, err)
	rdb := redis.NewClient(opts)
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}
