package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListPanoramas returns every panorama anchored to the given territory.
func (c *Client) ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error) {
	resp, err := c.cc.ListPanoramas(ctx, &catalogv1.ListPanoramasRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListPanoramas: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Panorama, len(resp.GetPanoramas()))
	for i, p := range resp.GetPanoramas() {
		out[i] = panoramaFromProto(p)
	}
	return out, nil
}

// CreatePanorama anchors a new equirect panorama in the territory.
func (c *Client) CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	resp, err := c.cc.CreatePanorama(ctx, &catalogv1.CreatePanoramaRequest{
		TerritorySlug:  p.TerritorySlug,
		Slug:           p.Slug,
		Title:          p.Title,
		SourceBlobHash: p.SourceBlobHash,
		Position:       vec3ToProto(p.Position),
		YawOffset:      p.YawOffset,
	})
	if err != nil {
		return domain.Panorama{}, fmt.Errorf("catalog.CreatePanorama: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return panoramaFromProto(resp.GetPanorama()), nil
}

// UpdatePanorama replaces title, position, and yaw offset.
func (c *Client) UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error) {
	resp, err := c.cc.UpdatePanorama(ctx, &catalogv1.UpdatePanoramaRequest{
		Id:        p.ID,
		Title:     p.Title,
		Position:  vec3ToProto(p.Position),
		YawOffset: p.YawOffset,
	})
	if err != nil {
		return domain.Panorama{}, fmt.Errorf("catalog.UpdatePanorama: %w", grpcerr.MapStatus(err, domain.ErrPanoramaNotFound))
	}
	return panoramaFromProto(resp.GetPanorama()), nil
}

// DeletePanorama removes a panorama by ID.
func (c *Client) DeletePanorama(ctx context.Context, id int64) error {
	_, err := c.cc.DeletePanorama(ctx, &catalogv1.DeletePanoramaRequest{Id: id})
	if err != nil {
		return fmt.Errorf("catalog.DeletePanorama: %w", grpcerr.MapStatus(err, domain.ErrPanoramaNotFound))
	}
	return nil
}
