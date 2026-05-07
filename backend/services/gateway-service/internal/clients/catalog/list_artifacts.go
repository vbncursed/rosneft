package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListArtifacts returns every artifact for a project.
func (c *Client) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	resp, err := c.cc.ListArtifacts(ctx, &catalogv1.ListArtifactsRequest{ProjectSlug: slug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListArtifacts: %w", err)
	}
	out := make([]domain.Artifact, len(resp.GetArtifacts()))
	for i, a := range resp.GetArtifacts() {
		out[i] = artifactFromProto(a)
	}
	return out, nil
}
