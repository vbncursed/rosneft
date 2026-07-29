// Package service holds the audit service's business logic: scope validation,
// pagination, and recording the events no trigger can see.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

//go:generate minimock -i Store -o ./mocks -s _mock.go

// Store is the persistence contract.
type Store interface {
	List(ctx context.Context, f domain.Filter) ([]domain.Entry, error)
	DistinctActors(ctx context.Context, f domain.Filter) ([]string, error)
	Record(ctx context.Context, e domain.Entry) (int64, error)

	LastCheckpoint(ctx context.Context) (domain.Checkpoint, bool, error)
	SequenceWatermark(ctx context.Context) (int64, error)
	ComputeDigest(ctx context.Context, fromID, boundary int64, prev string) (int32, int64, string, error)
	SaveCheckpoint(ctx context.Context, c domain.Checkpoint) (domain.Checkpoint, error)
	ListCheckpoints(ctx context.Context) ([]domain.Checkpoint, error)
	TableStats(ctx context.Context) (rows, bytes int64, err error)
}

// Service is the audit service.
type Service struct {
	store Store
}

// New constructs the audit service.
func New(store Store) *Service {
	return &Service{store: store}
}
