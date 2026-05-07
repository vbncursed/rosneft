package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return g.catalog.ListProjects(ctx)
}
