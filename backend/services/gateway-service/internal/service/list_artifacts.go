package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if slug == "" {
		return nil, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return g.catalog.ListArtifacts(ctx, slug)
}
