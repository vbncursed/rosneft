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
//
// owningAdmin and auditCompany are deliberately separate: the former is the
// territory-visibility key (self for a guest), the latter the real created_by
// tenant the audit log attributes changes to.
//
// totpRequired is cached here too: it is policy, a column on the user row,
// exactly like perms and isOwner, so it inherits the same TTL-bounded staleness
// they already have. Whether the account has actually enrolled is deliberately
// NOT part of this snapshot — that answer comes from twofa-service and must
// stay live, or a user who just enrolled would still read as blocked for up to
// authzCacheTTL after succeeding.
type authz struct {
	perms        []string
	isOwner      bool
	owningAdmin  string
	auditCompany string
	totpRequired bool
	// pwEpoch is the user's current password epoch; a session minted under an
	// older one is refused.
	pwEpoch int64
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
	// gen counts drops per user. A reader captures it with get, before it loads
	// from the store, and set stores only if no drop happened since: a request
	// that missed the cache before a password change must not put its
	// pre-change snapshot back after the change dropped it.
	gen map[string]uint64
}

type authzEntry struct {
	a   authz
	exp time.Time
}

func newAuthzCache(ttl time.Duration) *authzCache {
	return &authzCache{ttl: ttl, m: make(map[string]authzEntry), gen: make(map[string]uint64)}
}

// get returns the live snapshot, and the generation to hand to set if it missed.
func (c *authzCache) get(userID string) (authz, uint64, bool) {
	c.mu.RLock()
	e, ok := c.m[userID]
	gen := c.gen[userID]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.exp) {
		return authz{}, gen, false
	}
	return e.a, gen, true
}

// set stores a snapshot loaded after get returned gen, unless a drop ran since.
func (c *authzCache) set(userID string, a authz, gen uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.gen[userID] != gen {
		return
	}
	c.m[userID] = authzEntry{a: a, exp: time.Now().Add(c.ttl)}
}

// drop forgets a user's snapshot so the next ValidateToken reads the row again,
// and invalidates every load already in flight.
func (c *authzCache) drop(userID string) {
	c.mu.Lock()
	delete(c.m, userID)
	c.gen[userID]++
	c.mu.Unlock()
}
