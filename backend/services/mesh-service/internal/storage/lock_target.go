package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// lockKey names the reconciler's claim on one conversion target.
func lockKey(kind domain.Kind, slug string) string {
	return fmt.Sprintf("andrey:mesh:inflight:%s:%s", kind, slug)
}

// unlockScript deletes the claim only while it still names ARGV[1]: a claim
// that lapsed and was re-taken by another owner is not the caller's to drop.
var unlockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`)

// TryLockTarget claims a target for owner with SET NX EX. Reports false when
// the key already exists, i.e. another reconcile pass or another worker holds it.
func (r *Redis) TryLockTarget(
	ctx context.Context, kind domain.Kind, slug, owner string, ttl time.Duration,
) (bool, error) {
	ok, err := r.client.SetNX(ctx, lockKey(kind, slug), owner, ttl).Result()
	if err != nil {
		return false, fmt.Errorf("storage.TryLockTarget: setnx: %w", err)
	}
	return ok, nil
}

// UnlockTarget releases owner's claim. A key that is gone, or now held by
// another owner, is left alone and is not an error: a user-initiated
// conversion never took one, and a lapsed claim is the new owner's.
func (r *Redis) UnlockTarget(ctx context.Context, kind domain.Kind, slug, owner string) error {
	if err := unlockScript.Run(ctx, r.client, []string{lockKey(kind, slug)}, owner).Err(); err != nil {
		return fmt.Errorf("storage.UnlockTarget: del: %w", err)
	}
	return nil
}

// HoldTarget claims a target for owner with a plain SET EX, whoever held it
// before: the job starting now is the one the claim stands for from here on,
// and the previous owner's later UnlockTarget no longer matches.
func (r *Redis) HoldTarget(ctx context.Context, kind domain.Kind, slug, owner string, ttl time.Duration) error {
	if err := r.client.Set(ctx, lockKey(kind, slug), owner, ttl).Err(); err != nil {
		return fmt.Errorf("storage.HoldTarget: set: %w", err)
	}
	return nil
}
