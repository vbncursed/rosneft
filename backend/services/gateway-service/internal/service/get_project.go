package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	if slug == "" {
		return domain.Project{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return g.catalog.GetProject(ctx, slug)
}
