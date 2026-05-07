package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListProjects returns every catalog project as gateway domain values.
func (c *Client) ListProjects(ctx context.Context) ([]domain.Project, error) {
	resp, err := c.cc.ListProjects(ctx, &catalogv1.ListProjectsRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListProjects: %w", err)
	}
	out := make([]domain.Project, len(resp.GetProjects()))
	for i, p := range resp.GetProjects() {
		out[i] = projectFromProto(p)
	}
	return out, nil
}
