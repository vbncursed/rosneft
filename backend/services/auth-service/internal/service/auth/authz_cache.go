package auth

import (
	"sync"
	"time"
)

// authzCacheTTL bounds how long a role/permission change can take to apply
// without a re-login. Short enough to feel instant, long enough to absorb the
// per-request validate load.
const authzCacheTTL = 5 * time.Second

// authz is the per-user authorization snapshot ValidateToken returns.
type authz struct {
	perms       []string
	isOwner     bool
	owningAdmin string
}

// authzCache memoizes the DB hydration done by ValidateToken, keyed by user id,
// for a short TTL. Liveness (session existence/expiry/logout) is NOT cached —
// it is re-checked against Redis on every call — so only authorization is
// served stale, and only within the TTL window.
//
// ponytail: no eviction; the map is bounded by the count of distinct active
// users (tiny here). Add a sweep if that ever grows unbounded.
type authzCache struct {
	ttl time.Duration
	mu  sync.RWMutex
	m   map[string]authzEntry
}

type authzEntry struct {
	a   authz
	exp time.Time
}

func newAuthzCache(ttl time.Duration) *authzCache {
	return &authzCache{ttl: ttl, m: make(map[string]authzEntry)}
}

func (c *authzCache) get(userID string) (authz, bool) {
	c.mu.RLock()
	e, ok := c.m[userID]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.exp) {
		return authz{}, false
	}
	return e.a, true
}

func (c *authzCache) set(userID string, a authz) {
	c.mu.Lock()
	c.m[userID] = authzEntry{a: a, exp: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}
