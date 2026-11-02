package storage

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// forgetJob drops a target's index entry and starts the retention clock of the
// job it named.
var forgetJob = redis.NewScript(`
local old = redis.call("HGET", KEYS[1], ARGV[1])
redis.call("HDEL", KEYS[1], ARGV[1])
if old then redis.call("EXPIRE", ARGV[2] .. old, ARGV[3]) end
return 0`)

// ForgetTarget removes the target's index entry. A missing field is not an
// error, so a sweep that races another replica's sweep is fine. The job hash
// stays readable by id for JobRetention, then expires.
func (r *Redis) ForgetTarget(ctx context.Context, kind domain.Kind, slug string) error {
	err := forgetJob.Run(ctx, r.client, []string{targetsKey}, targetField(kind, slug), jobKeyPrefix, retentionSeconds).
		Err()
	if err != nil {
		return fmt.Errorf("storage.ForgetTarget: script: %w", err)
	}
	return nil
}
