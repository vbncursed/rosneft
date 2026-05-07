package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ListProjects returns every catalog project as mesh-service domain values.
// Used by the worker's reconciler to find projects without artifacts.
func (c *Client) ListProjects(ctx context.Context) ([]domain.Project, error) {
	resp, err := c.cc.ListProjects(ctx, &catalogv1.ListProjectsRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListProjects: %w", err)
	}
	out := make([]domain.Project, len(resp.GetProjects()))
	for i, p := range resp.GetProjects() {
		out[i] = domain.Project{
			Slug:              p.GetSlug(),
			Title:             p.GetTitle(),
			Subtitle:          p.GetSubtitle(),
			Description:       p.GetDescription(),
			SourceObjPath:     p.GetSourceObjPath(),
			SourceMtlPath:     p.GetSourceMtlPath(),
			SourceTexturePath: p.GetSourceTexturePath(),
		}
	}
	return out, nil
}
