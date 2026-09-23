package grpcapi_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

// An absent optional field stays nil and a present empty one arrives as "",
// the difference between "keep" and "clear".
func TestUpdateTerritoryPassesPresenceThrough(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpdateTerritoryMock.
		Expect(t.Context(), "t1", domain.TerritoryPatch{Description: new("")}).
		Return(domain.Territory{Slug: "t1", Title: "Site"}, nil)

	out, err := grpcapi.New(svc).UpdateTerritory(t.Context(),
		&catalogv1.UpdateTerritoryRequest{Slug: "t1", Description: new("")})
	assert.NilError(t, err)
	assert.Equal(t, out.GetTerritory().GetTitle(), "Site")
}

func TestUpdateTerritoryOfAnUnknownSlugIsNotFound(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpdateTerritoryMock.Return(domain.Territory{}, domain.ErrTerritoryNotFound)
	_, err := grpcapi.New(svc).UpdateTerritory(t.Context(), &catalogv1.UpdateTerritoryRequest{Slug: "x"})
	assert.Equal(t, status.Code(err), codes.NotFound)
}

// A create under a slug already taken is AlreadyExists, not Internal.
func TestUpsertTerritoryOfATakenSlugAlreadyExists(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpsertTerritoryMock.Return(domain.Territory{}, domain.ErrSlugConflict)
	_, err := grpcapi.New(svc).UpsertTerritory(t.Context(),
		&catalogv1.UpsertTerritoryRequest{Territory: &catalogv1.Territory{Slug: "t1"}})
	assert.Equal(t, status.Code(err), codes.AlreadyExists)
}
