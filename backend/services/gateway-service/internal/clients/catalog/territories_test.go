// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
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

// Absent stays absent on the wire: that is what keeps the catalog's column.
func TestUpdateTerritorySendsOnlyTheSetFields(t *testing.T) {
	cc := &updateCC{}
	got, err := (&Client{cc: cc}).UpdateTerritory(t.Context(), "yard",
		domain.TerritoryUpdate{Description: new(""), SourceBlobHash: new("h")})
	assert.NilError(t, err)
	assert.Equal(t, got.Slug, "yard")
	assert.Assert(t, cc.territory.Title == nil && cc.territory.ExternalPanoramaUrl == nil)
	assert.Equal(t, *cc.territory.Description, "")
	assert.Equal(t, *cc.territory.SourceBlobHash, "h")
}

func TestUpdateTerritoryNotFoundIsTheSentinel(t *testing.T) {
	cc := &updateCC{err: status.Error(codes.NotFound, "territory not found")}
	_, err := (&Client{cc: cc}).UpdateTerritory(t.Context(), "x", domain.TerritoryUpdate{Title: new("t")})
	assert.ErrorIs(t, err, domain.ErrTerritoryNotFound)
}
