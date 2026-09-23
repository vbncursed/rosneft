// In-package test: it substitutes the unexported gRPC stub on Client
// (updateCC lives in territories_test.go).
package catalog

import (
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func TestUpdateModelSendsOnlyTheSetFields(t *testing.T) {
	cc := &updateCC{}
	got, err := (&Client{cc: cc}).UpdateModel(t.Context(), "pump", domain.ModelUpdate{ThumbnailBlobHash: new("")})
	assert.NilError(t, err)
	assert.Equal(t, got.Slug, "pump")
	assert.Assert(t, cc.model.Title == nil && cc.model.Description == nil)
	assert.Equal(t, *cc.model.ThumbnailBlobHash, "")
}

func TestUpdateModelNotFoundIsTheSentinel(t *testing.T) {
	cc := &updateCC{err: status.Error(codes.NotFound, "model not found")}
	_, err := (&Client{cc: cc}).UpdateModel(t.Context(), "x", domain.ModelUpdate{Title: new("t")})
	assert.ErrorIs(t, err, domain.ErrModelNotFound)
}
