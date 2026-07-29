package service

import "context"

// TableStats exposes the journal's size so the checkpointer can publish it.
// It is a pass-through: there is no policy to apply, and the alert threshold
// lives in Prometheus where it can change without a deploy.
func (s *Service) TableStats(ctx context.Context) (rows, bytes int64, err error) {
	return s.store.TableStats(ctx)
}
