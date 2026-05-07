package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// RegisterArtifact upserts a converted artifact in the catalog. The Kind on
// the Artifact selects which catalog table the row lands in.
func (c *Client) RegisterArtifact(ctx context.Context, a domain.Artifact) error {
	bbMin := &catalogv1.Vec3{X: a.BBoxMin.X, Y: a.BBoxMin.Y, Z: a.BBoxMin.Z}
	bbMax := &catalogv1.Vec3{X: a.BBoxMax.X, Y: a.BBoxMax.Y, Z: a.BBoxMax.Z}

	switch a.Kind {
	case domain.KindTerritory:
		_, err := c.cc.RegisterTerritoryArtifact(ctx, &catalogv1.RegisterTerritoryArtifactRequest{
			Artifact: &catalogv1.TerritoryArtifact{
				TerritorySlug: a.Slug,
				Lod:           a.LOD,
				Hash:          a.Hash,
				ContentType:   a.ContentType,
				Size:          a.Size,
				Vertices:      a.Vertices,
				Faces:         a.Faces,
				BboxMin:       bbMin,
				BboxMax:       bbMax,
			},
		})
		if err != nil {
			return fmt.Errorf("catalog.RegisterArtifact territory: %w", mapStatusErr(err, domain.ErrTargetNotFound))
		}
		return nil

	case domain.KindModel:
		_, err := c.cc.RegisterModelArtifact(ctx, &catalogv1.RegisterModelArtifactRequest{
			Artifact: &catalogv1.ModelArtifact{
				ModelSlug:   a.Slug,
				Lod:         a.LOD,
				Hash:        a.Hash,
				ContentType: a.ContentType,
				Size:        a.Size,
				Vertices:    a.Vertices,
				Faces:       a.Faces,
				BboxMin:     bbMin,
				BboxMax:     bbMax,
			},
		})
		if err != nil {
			return fmt.Errorf("catalog.RegisterArtifact model: %w", mapStatusErr(err, domain.ErrTargetNotFound))
		}
		return nil

	default:
		return fmt.Errorf("catalog.RegisterArtifact: %w: kind %v", domain.ErrInvalidInput, a.Kind)
	}
}
