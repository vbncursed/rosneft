package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetArtifact returns the artifact for (slug, lod) or domain.ErrArtifactNotFound.
func (c *Client) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	resp, err := c.cc.GetArtifact(ctx, &catalogv1.GetArtifactRequest{ProjectSlug: slug, Lod: lod})
	if err != nil {
		return domain.Artifact{}, fmt.Errorf("catalog.GetArtifact: %w", mapStatusErr(err, domain.ErrArtifactNotFound))
	}
	return artifactFromProto(resp.GetArtifact()), nil
}
