package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// maxMeasurementPoints mirrors catalog's cap. Catalog owns the chain's shape
// rules; the gateway repeats only this one, so an oversized body is refused
// before it is copied into an RPC.
const maxMeasurementPoints = 1000

// ListMeasurements returns the saved measurements on a territory.
func (g *Gateway) ListMeasurements(ctx context.Context, territorySlug string) ([]domain.Measurement, error) {
	if territorySlug == "" {
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.ListMeasurements(ctx, territorySlug)
}

// CreateMeasurement saves a finished chain on m.TerritorySlug.
func (g *Gateway) CreateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	if err := checkMeasurement(m); err != nil {
		return domain.Measurement{}, err
	}
	return g.catalog.CreateMeasurement(ctx, m)
}

// UpdateMeasurement replaces a saved chain. The catalog scopes the id by
// m.TerritorySlug, so an id of another territory is not found.
func (g *Gateway) UpdateMeasurement(ctx context.Context, m domain.Measurement) (domain.Measurement, error) {
	if m.ID <= 0 {
		return domain.Measurement{}, fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	if err := checkMeasurement(m); err != nil {
		return domain.Measurement{}, err
	}
	return g.catalog.UpdateMeasurement(ctx, m)
}

// DeleteMeasurement removes measurement id on territorySlug.
func (g *Gateway) DeleteMeasurement(ctx context.Context, territorySlug string, id int64) error {
	if territorySlug == "" {
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if id <= 0 {
		return fmt.Errorf("%w: id is required", domain.ErrInvalidInput)
	}
	return g.catalog.DeleteMeasurement(ctx, territorySlug, id)
}

// DeleteMeasurements removes every measurement on territorySlug and returns
// the count.
func (g *Gateway) DeleteMeasurements(ctx context.Context, territorySlug string) (int, error) {
	if territorySlug == "" {
		return 0, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	return g.catalog.DeleteMeasurements(ctx, territorySlug)
}

func checkMeasurement(m domain.Measurement) error {
	if m.TerritorySlug == "" {
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	}
	if len(m.Points) > maxMeasurementPoints {
		return fmt.Errorf("%w: at most %d points", domain.ErrInvalidInput, maxMeasurementPoints)
	}
	return nil
}
