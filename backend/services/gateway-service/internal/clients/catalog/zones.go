package catalog

import (
	"context"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListModelTags returns the fixed tag list in the catalog's order.
func (c *Client) ListModelTags(ctx context.Context) ([]domain.ModelTag, error) {
	resp, err := c.cc.ListModelTags(ctx, &catalogv1.ListModelTagsRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListModelTags: %w", grpcerr.MapStatus(err, nil))
	}
	return modelTagsFromProto(resp.GetTags()), nil
}

// ListZones returns the territory's zones, for the scene bundle and the list
// route. A catalog without the RPC (a gateway deployed ahead of it, or a
// catalog rolled back) answers Unimplemented, which is no zones: the scene
// still loads.
func (c *Client) ListZones(ctx context.Context, territorySlug string) ([]domain.Zone, error) {
	resp, err := c.cc.ListZones(ctx, &catalogv1.ListZonesRequest{TerritorySlug: territorySlug})
	if status.Code(err) == codes.Unimplemented {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("catalog.ListZones: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Zone, len(resp.GetZones()))
	for i, z := range resp.GetZones() {
		out[i] = zoneFromProto(z)
	}
	return out, nil
}

// CreateZone draws a zone on territorySlug. The author is not sent: catalog
// records it from the actor metadata.
func (c *Client) CreateZone(ctx context.Context, territorySlug string, z domain.ZoneCreate) (domain.Zone, error) {
	corners := make([]*catalogv1.Vec3, len(z.Corners))
	for i, p := range z.Corners {
		corners[i] = vec3ToProto(p)
	}
	resp, err := c.cc.CreateZone(ctx, &catalogv1.CreateZoneRequest{
		TerritorySlug:  territorySlug,
		Title:          z.Title,
		Corners:        corners,
		TagSlugs:       z.TagSlugs,
		DrawingWidthM:  z.DrawingWidthM,
		DrawingHeightM: z.DrawingHeightM,
	})
	if err != nil {
		return domain.Zone{}, zoneRefusal("catalog.CreateZone", err)
	}
	return zoneFromProto(resp.GetZone()), nil
}

// UpdateZone writes the title when p sets one and replaces the tags when
// p.SetTags is true.
func (c *Client) UpdateZone(ctx context.Context, territorySlug string, id int64, p domain.ZonePatch) (domain.Zone, error) {
	resp, err := c.cc.UpdateZone(ctx, &catalogv1.UpdateZoneRequest{
		TerritorySlug: territorySlug,
		Id:            id,
		Title:         p.Title,
		TagSlugs:      p.TagSlugs,
		SetTags:       p.SetTags,
	})
	if err != nil {
		return domain.Zone{}, zoneRefusal("catalog.UpdateZone", err)
	}
	return zoneFromProto(resp.GetZone()), nil
}

// DeleteZone removes zone id on territorySlug.
func (c *Client) DeleteZone(ctx context.Context, territorySlug string, id int64) error {
	_, err := c.cc.DeleteZone(ctx, &catalogv1.DeleteZoneRequest{TerritorySlug: territorySlug, Id: id})
	if err != nil {
		return zoneRefusal("catalog.DeleteZone", err)
	}
	return nil
}

// zoneRefusal maps a failed zone write. A NotFound is the zone unless its
// message names the territory.
func zoneRefusal(op string, err error) error {
	return grpcerr.Refused(op, err, domain.ErrZoneNotFound, domain.ErrTerritoryNotFound)
}

func zoneFromProto(z *catalogv1.Zone) domain.Zone {
	if z == nil {
		return domain.Zone{}
	}
	corners := make([]domain.Vec3, len(z.GetCorners()))
	for i, p := range z.GetCorners() {
		corners[i] = vec3FromProto(p)
	}
	return domain.Zone{
		ID:             z.GetId(),
		Title:          z.GetTitle(),
		Corners:        corners,
		Tags:           modelTagsFromProto(z.GetTags()),
		DrawingWidthM:  z.DrawingWidthM,
		DrawingHeightM: z.DrawingHeightM,
		CreatedAt:      z.GetCreatedAt().AsTime(),
		UpdatedAt:      z.GetUpdatedAt().AsTime(),
	}
}

func modelTagFromProto(t *catalogv1.ModelTag) domain.ModelTag {
	return domain.ModelTag{Slug: t.GetSlug(), Title: t.GetTitle()}
}

func modelTagsFromProto(in []*catalogv1.ModelTag) []domain.ModelTag {
	out := make([]domain.ModelTag, len(in))
	for i, t := range in {
		out[i] = modelTagFromProto(t)
	}
	return out
}
