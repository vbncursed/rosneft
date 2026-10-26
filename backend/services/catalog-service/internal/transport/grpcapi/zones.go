package grpcapi

import (
	"context"
	"fmt"

	"google.golang.org/protobuf/types/known/timestamppb"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func zoneToProto(z domain.Zone) *catalogv1.Zone {
	corners := make([]*catalogv1.Vec3, len(z.Corners))
	for i, c := range z.Corners {
		corners[i] = vec3ToProto(c)
	}
	tags := make([]*catalogv1.ModelTag, len(z.Tags))
	for i, t := range z.Tags {
		tags[i] = modelTagToProto(t)
	}
	return &catalogv1.Zone{
		Id:             z.ID,
		Title:          z.Title,
		Corners:        corners,
		Tags:           tags,
		DrawingWidthM:  z.DrawingWidthM,
		DrawingHeightM: z.DrawingHeightM,
		CreatedAt:      timestamppb.New(z.CreatedAt),
		UpdatedAt:      timestamppb.New(z.UpdatedAt),
	}
}

func (s *Server) ListZones(ctx context.Context, req *catalogv1.ListZonesRequest) (*catalogv1.ListZonesResponse, error) {
	zones, err := s.svc.ListZones(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.Zone, len(zones))
	for i, z := range zones {
		out[i] = zoneToProto(z)
	}
	return &catalogv1.ListZonesResponse{Zones: out}, nil
}

func (s *Server) CreateZone(ctx context.Context, req *catalogv1.CreateZoneRequest) (*catalogv1.CreateZoneResponse, error) {
	var corners [4]domain.Vec3
	if n := len(req.GetCorners()); n != len(corners) {
		return nil, mapError(fmt.Errorf("%w: a zone has %d corners, got %d", domain.ErrInvalidInput, len(corners), n))
	}
	for i, c := range req.GetCorners() {
		corners[i] = vec3FromProto(c)
	}
	z, err := s.svc.CreateZone(ctx, req.GetTerritorySlug(), domain.ZoneCreate{
		Title:          req.GetTitle(),
		Corners:        corners,
		TagSlugs:       req.GetTagSlugs(),
		DrawingWidthM:  req.DrawingWidthM,
		DrawingHeightM: req.DrawingHeightM,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreateZoneResponse{Zone: zoneToProto(z)}, nil
}

func (s *Server) UpdateZone(ctx context.Context, req *catalogv1.UpdateZoneRequest) (*catalogv1.UpdateZoneResponse, error) {
	z, err := s.svc.UpdateZone(ctx, req.GetTerritorySlug(), req.GetId(), domain.ZonePatch{
		Title:    req.Title,
		TagSlugs: req.GetTagSlugs(),
		SetTags:  req.GetSetTags(),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdateZoneResponse{Zone: zoneToProto(z)}, nil
}

func (s *Server) DeleteZone(ctx context.Context, req *catalogv1.DeleteZoneRequest) (*catalogv1.DeleteZoneResponse, error) {
	if err := s.svc.DeleteZone(ctx, req.GetTerritorySlug(), req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.DeleteZoneResponse{}, nil
}
