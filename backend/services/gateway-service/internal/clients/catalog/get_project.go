package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetProject returns a project by slug or domain.ErrProjectNotFound.
func (c *Client) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	resp, err := c.cc.GetProject(ctx, &catalogv1.GetProjectRequest{Slug: slug})
	if err != nil {
		return domain.Project{}, fmt.Errorf("catalog.GetProject: %w", mapStatusErr(err, domain.ErrProjectNotFound))
	}
	return projectFromProto(resp.GetProject()), nil
}
