// In-package test: the stubs stand in for the unexported gRPC client on
// Client, and more than one test file uses each.
package catalog

import (
	"context"

	"google.golang.org/grpc"

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

// refusingCC answers both placement creates with err.
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
