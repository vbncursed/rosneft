package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// RegisterArtifact upserts a converted artifact in the catalog. Maps
// domain.Artifact to pb at the boundary so the service layer never sees pb.
func (c *Client) RegisterArtifact(ctx context.Context, a domain.Artifact) error {
	_, err := c.cc.RegisterArtifact(ctx, &catalogv1.RegisterArtifactRequest{
		Artifact: &catalogv1.Artifact{
			ProjectSlug: a.ProjectSlug,
			Lod:         a.LOD,
			Hash:        a.Hash,
			ContentType: a.ContentType,
			Size:        a.Size,
			Vertices:    a.Vertices,
			Faces:       a.Faces,
			BboxMin:     &catalogv1.Vec3{X: a.BBoxMin.X, Y: a.BBoxMin.Y, Z: a.BBoxMin.Z},
			BboxMax:     &catalogv1.Vec3{X: a.BBoxMax.X, Y: a.BBoxMax.Y, Z: a.BBoxMax.Z},
		},
	})
	if err != nil {
		return fmt.Errorf("catalog.RegisterArtifact: %w", mapStatusErr(err, domain.ErrProjectNotFound))
	}
	return nil
}
