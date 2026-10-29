package redistest

import (
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// Mini returns a client on an in-process miniredis (Lua, TTLs and SET options
// included), so the Redis-backed stores can be unit-tested without Docker. It
// returns the server too, for FastForward and direct inspection.
func Mini(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, mr
}
