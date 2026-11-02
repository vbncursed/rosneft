// In-package test: the stubs stand in for the unexported gRPC client on
// Client, and more than one test file uses each.
package catalog

import (
	"context"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// updateCC records the last partial-edit request and answers with err.
type updateCC struct {
	catalogv1.CatalogServiceClient
	err       error
	territory *catalogv1.UpdateTerritoryRequest
	model     *catalogv1.UpdateModelRequest
}

func (u *updateCC) UpdateTerritory(
	_ context.Context, in *catalogv1.UpdateTerritoryRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateTerritoryResponse, error) {
	u.territory = in
	return &catalogv1.UpdateTerritoryResponse{Territory: &catalogv1.Territory{Slug: in.GetSlug()}}, u.err
}

func (u *updateCC) UpdateModel(
	_ context.Context, in *catalogv1.UpdateModelRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateModelResponse, error) {
	u.model = in
	return &catalogv1.UpdateModelResponse{Model: &catalogv1.Model{Slug: in.GetSlug()}}, u.err
}

// refusingCC answers every placement mutation with err.
type refusingCC struct {
	catalogv1.CatalogServiceClient
	err error
}

func (r refusingCC) CreatePlacement(
	context.Context, *catalogv1.CreatePlacementRequest, ...grpc.CallOption,
) (*catalogv1.CreatePlacementResponse, error) {
	return nil, r.err
}

func (r refusingCC) CreatePlacements(
	context.Context, *catalogv1.CreatePlacementsRequest, ...grpc.CallOption,
) (*catalogv1.CreatePlacementsResponse, error) {
	return nil, r.err
}

func (r refusingCC) UpdatePlacement(
	context.Context, *catalogv1.UpdatePlacementRequest, ...grpc.CallOption,
) (*catalogv1.UpdatePlacementResponse, error) {
	return nil, r.err
}

func (r refusingCC) SetPlacementVisibility(
	context.Context, *catalogv1.SetPlacementVisibilityRequest, ...grpc.CallOption,
) (*catalogv1.SetPlacementVisibilityResponse, error) {
	return nil, r.err
}

func (r refusingCC) DeletePlacement(
	context.Context, *catalogv1.DeletePlacementRequest, ...grpc.CallOption,
) (*catalogv1.DeletePlacementResponse, error) {
	return nil, r.err
}

// zoneCC records the last request of each zone and tag call and answers with a
// fixed zone, or with err.
type zoneCC struct {
	catalogv1.CatalogServiceClient
	err    error
	create *catalogv1.CreateZoneRequest
	update *catalogv1.UpdateZoneRequest
	del    *catalogv1.DeleteZoneRequest
	upsert *catalogv1.UpsertModelRequest
	patch  *catalogv1.UpdateModelRequest
}

var zoneStamp = time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)

var wireZone = &catalogv1.Zone{
	Id: 7, Title: "Camp",
	Corners:        []*catalogv1.Vec3{{X: 1}, {X: 2}, {X: 3}, {X: 4}},
	Tags:           []*catalogv1.ModelTag{{Slug: "camp", Title: "Camp & accommodation"}},
	DrawingWidthM:  new(30.5),
	CreatedAt:      timestamppb.New(zoneStamp),
	UpdatedAt:      timestamppb.New(zoneStamp),
	DrawingHeightM: nil,
}

func (z *zoneCC) ListModelTags(
	context.Context, *catalogv1.ListModelTagsRequest, ...grpc.CallOption,
) (*catalogv1.ListModelTagsResponse, error) {
	return &catalogv1.ListModelTagsResponse{Tags: []*catalogv1.ModelTag{{Slug: "camp", Title: "Camp"}}}, z.err
}

func (z *zoneCC) ListZones(
	context.Context, *catalogv1.ListZonesRequest, ...grpc.CallOption,
) (*catalogv1.ListZonesResponse, error) {
	if z.err != nil {
		return nil, z.err
	}
	return &catalogv1.ListZonesResponse{Zones: []*catalogv1.Zone{wireZone}}, nil
}

func (z *zoneCC) CreateZone(
	_ context.Context, in *catalogv1.CreateZoneRequest, _ ...grpc.CallOption,
) (*catalogv1.CreateZoneResponse, error) {
	z.create = in
	return &catalogv1.CreateZoneResponse{Zone: wireZone}, z.err
}

func (z *zoneCC) UpdateZone(
	_ context.Context, in *catalogv1.UpdateZoneRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateZoneResponse, error) {
	z.update = in
	return &catalogv1.UpdateZoneResponse{Zone: wireZone}, z.err
}

func (z *zoneCC) DeleteZone(
	_ context.Context, in *catalogv1.DeleteZoneRequest, _ ...grpc.CallOption,
) (*catalogv1.DeleteZoneResponse, error) {
	z.del = in
	return &catalogv1.DeleteZoneResponse{}, z.err
}

func (z *zoneCC) UpsertModel(
	_ context.Context, in *catalogv1.UpsertModelRequest, _ ...grpc.CallOption,
) (*catalogv1.UpsertModelResponse, error) {
	z.upsert = in
	return &catalogv1.UpsertModelResponse{Model: &catalogv1.Model{
		Slug: "cabin", Tag: &catalogv1.ModelTag{Slug: in.GetTagSlug(), Title: "Camp & accommodation"},
	}}, z.err
}

func (z *zoneCC) UpdateModel(
	_ context.Context, in *catalogv1.UpdateModelRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateModelResponse, error) {
	z.patch = in
	return &catalogv1.UpdateModelResponse{Model: &catalogv1.Model{Slug: in.GetSlug()}}, z.err
}
