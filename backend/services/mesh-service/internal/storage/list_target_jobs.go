package storage

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListTargetJobs reads the target index and the job hash behind each entry in
// one pipeline. An index entry whose job hash is gone (nothing deletes them
// today) is skipped rather than reported. The result is sorted by kind then
// slug: HVALS has no order and the console groups by kind.
func (r *Redis) ListTargetJobs(ctx context.Context) ([]domain.Job, error) {
	ids, err := r.client.HVals(ctx, targetsKey).Result()
	if err != nil {
		return nil, fmt.Errorf("storage.ListTargetJobs: hvals: %w", err)
	}
	cmds := make([]*redis.MapStringStringCmd, len(ids))
	if _, err := r.client.Pipelined(ctx, func(p redis.Pipeliner) error {
		for i, id := range ids {
			cmds[i] = p.HGetAll(ctx, jobKey(id))
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("storage.ListTargetJobs: hgetall: %w", err)
	}
	out := make([]domain.Job, 0, len(ids))
	for _, c := range cmds {
		res, err := c.Result()
		if err != nil {
			return nil, fmt.Errorf("storage.ListTargetJobs: hgetall: %w", err)
		}
		if len(res) == 0 {
			continue
		}
		out = append(out, jobFromHash(res))
	}
	slices.SortFunc(out, func(a, b domain.Job) int {
		return cmp.Or(cmp.Compare(a.Kind, b.Kind), strings.Compare(a.Slug, b.Slug))
	})
	return out, nil
}
