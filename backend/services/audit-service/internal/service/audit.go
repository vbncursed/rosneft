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
}

// Service is the audit service.
type Service struct {
	store Store
}

// New constructs the audit service.
func New(store Store) *Service {
	return &Service{store: store}
}
