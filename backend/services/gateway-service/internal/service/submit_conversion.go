package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (g *Gateway) SubmitConversion(ctx context.Context, slug string) (domain.Job, error) {
	if slug == "" {
		return domain.Job{}, fmt.Errorf("%w: slug is required", domain.ErrInvalidInput)
	}
	return g.mesh.SubmitConversion(ctx, slug)
}
