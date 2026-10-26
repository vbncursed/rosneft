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

func TestUpdateModelPassesPresenceThrough(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpdateModelMock.
		Expect(t.Context(), "m1", domain.ModelPatch{Title: new("Crate"), ThumbnailBlobHash: new("")}).
		Return(domain.Model{Slug: "m1", Title: "Crate"}, nil)

	out, err := grpcapi.New(svc).UpdateModel(t.Context(),
		&catalogv1.UpdateModelRequest{Slug: "m1", Title: new("Crate"), ThumbnailBlobHash: new("")})
	assert.NilError(t, err)
	assert.Equal(t, out.GetModel().GetTitle(), "Crate")
}

func TestUpdateModelOfAnUnknownSlugIsNotFound(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpdateModelMock.Return(domain.Model{}, domain.ErrModelNotFound)
	_, err := grpcapi.New(svc).UpdateModel(t.Context(), &catalogv1.UpdateModelRequest{Slug: "x"})
	assert.Equal(t, status.Code(err), codes.NotFound)
}

func TestUpdateModelPassesTagSlug(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpdateModelMock.
		Expect(t.Context(), "m1", domain.ModelPatch{TagSlug: new("camp")}).
		Return(domain.Model{Slug: "m1", Tag: domain.ModelTag{Slug: "camp", Title: "Camp & accommodation"}}, nil)

	out, err := grpcapi.New(svc).UpdateModel(t.Context(),
		&catalogv1.UpdateModelRequest{Slug: "m1", TagSlug: new("camp")})
	assert.NilError(t, err)
	assert.Equal(t, out.GetModel().GetTag().GetSlug(), "camp")
	assert.Equal(t, out.GetModel().GetTag().GetTitle(), "Camp & accommodation")
}

func TestUpsertModelMapsTagSlugAndAnUnknownTagIsInvalidArgument(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.UpsertModelMock.
		Expect(t.Context(), domain.Model{Title: "Box", Tag: domain.ModelTag{Slug: "nope"}}).
		Return(domain.Model{}, domain.ErrInvalidInput)

	_, err := grpcapi.New(svc).UpsertModel(t.Context(),
		&catalogv1.UpsertModelRequest{Model: &catalogv1.Model{Title: "Box"}, TagSlug: "nope"})
	assert.Equal(t, status.Code(err), codes.InvalidArgument)
}

func TestListModelTagsFillsTitles(t *testing.T) {
	svc := mocks.NewServiceMock(minimock.NewController(t))
	svc.ListModelTagsMock.Expect(t.Context()).Return([]domain.ModelTag{{Slug: "camp", Title: "Camp & accommodation"}}, nil)

	out, err := grpcapi.New(svc).ListModelTags(t.Context(), &catalogv1.ListModelTagsRequest{})
	assert.NilError(t, err)
	assert.Equal(t, len(out.GetTags()), 1)
	assert.Equal(t, out.GetTags()[0].GetTitle(), "Camp & accommodation")
}
