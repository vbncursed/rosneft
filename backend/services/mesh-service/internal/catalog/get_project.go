package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// GetProject fetches a project by slug and returns it as a mesh-service
// domain type. Pb leaks no further than this method.
func (c *Client) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	resp, err := c.cc.GetProject(ctx, &catalogv1.GetProjectRequest{Slug: slug})
	if err != nil {
		return domain.Project{}, fmt.Errorf("catalog.GetProject: %w", mapStatusErr(err, domain.ErrProjectNotFound))
	}
	p := resp.GetProject()
	return domain.Project{
		Slug:              p.GetSlug(),
		Title:             p.GetTitle(),
		Subtitle:          p.GetSubtitle(),
		Description:       p.GetDescription(),
		SourceObjPath:     p.GetSourceObjPath(),
		SourceMtlPath:     p.GetSourceMtlPath(),
		SourceTexturePath: p.GetSourceTexturePath(),
	}, nil
}
