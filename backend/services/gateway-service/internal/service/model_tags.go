package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListModelTags returns the fixed tag list, as the catalog sorts it.
func (g *Gateway) ListModelTags(ctx context.Context) ([]domain.ModelTag, error) {
	return g.catalog.ListModelTags(ctx)
}

// CreateModelTag adds a tag; the catalog validates the slug and title.
func (g *Gateway) CreateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	return g.catalog.CreateModelTag(ctx, slug, title)
}

// UpdateModelTag retitles a tag; the slug never changes.
func (g *Gateway) UpdateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	return g.catalog.UpdateModelTag(ctx, slug, title)
}
