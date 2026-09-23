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
