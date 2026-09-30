package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// lockKey names the reconciler's claim on one conversion target.
func lockKey(kind domain.Kind, slug string) string {
	return fmt.Sprintf("andrey:mesh:inflight:%s:%s", kind, slug)
}

// TryLockTarget claims a target with SET NX EX. Reports false when the key
// already exists, i.e. another reconcile pass or another worker holds it.
func (r *Redis) TryLockTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) (bool, error) {
	ok, err := r.client.SetNX(ctx, lockKey(kind, slug), "1", ttl).Result()
	if err != nil {
		return false, fmt.Errorf("storage.TryLockTarget: setnx: %w", err)
	}
	return ok, nil
}

// UnlockTarget releases the claim. Deleting a key that is not there is not an
// error: a user-initiated conversion never took one.
func (r *Redis) UnlockTarget(ctx context.Context, kind domain.Kind, slug string) error {
	if err := r.client.Del(ctx, lockKey(kind, slug)).Err(); err != nil {
		return fmt.Errorf("storage.UnlockTarget: del: %w", err)
	}
	return nil
}

// HoldTarget claims a target with a plain SET EX, whoever held it before:
// the job starting now is the one the claim stands for from here on.
func (r *Redis) HoldTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) error {
	if err := r.client.Set(ctx, lockKey(kind, slug), "1", ttl).Err(); err != nil {
		return fmt.Errorf("storage.HoldTarget: set: %w", err)
	}
	return nil
}
