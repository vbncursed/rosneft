package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// GetArtifact fetches an artifact by (slug, lod). Returns domain.ErrArtifactNotFound
// when the catalog has no artifact for the requested LOD — used by the
// reconciler to decide whether to queue a conversion.
func (c *Client) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	resp, err := c.cc.GetArtifact(ctx, &catalogv1.GetArtifactRequest{ProjectSlug: slug, Lod: lod})
	if err != nil {
		return domain.Artifact{}, fmt.Errorf("catalog.GetArtifact: %w", mapStatusErr(err, domain.ErrArtifactNotFound))
	}
	a := resp.GetArtifact()
	return domain.Artifact{
		ProjectSlug: a.GetProjectSlug(),
		LOD:         a.GetLod(),
		Hash:        a.GetHash(),
		ContentType: a.GetContentType(),
		Size:        a.GetSize(),
		Vertices:    a.GetVertices(),
		Faces:       a.GetFaces(),
		BBoxMin:     domain.Vec3{X: a.GetBboxMin().GetX(), Y: a.GetBboxMin().GetY(), Z: a.GetBboxMin().GetZ()},
		BBoxMax:     domain.Vec3{X: a.GetBboxMax().GetX(), Y: a.GetBboxMax().GetY(), Z: a.GetBboxMax().GetZ()},
	}, nil
}
