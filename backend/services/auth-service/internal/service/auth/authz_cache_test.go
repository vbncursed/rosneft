package auth

import (
	"testing"
	"time"

	"gotest.tools/v3/assert"
)

func TestAuthzCache(t *testing.T) {
	c := newAuthzCache(time.Hour)

	_, ok := c.get("u1")
	assert.Equal(t, ok, false) // empty = miss

	c.set("u1", authz{perms: []string{"territory:read"}, isOwner: true, owningAdmin: "admin-1"})
	got, ok := c.get("u1")
	assert.Equal(t, ok, true)
	assert.Equal(t, got.isOwner, true)
	assert.Equal(t, got.owningAdmin, "admin-1")
	assert.DeepEqual(t, got.perms, []string{"territory:read"})

	// An already-expired entry reads as a miss, forcing a fresh DB hydration.
	expired := newAuthzCache(-time.Second)
	expired.set("u2", authz{isOwner: true})
	_, ok = expired.get("u2")
	assert.Equal(t, ok, false)
}
