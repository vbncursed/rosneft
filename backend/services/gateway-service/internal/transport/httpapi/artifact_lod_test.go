package httpapi

import (
	"context"
	"testing"

	"gotest.tools/v3/assert"
)

// A negative LOD never exists. The handlers answer 404 before the catalog is
// asked: the embedded nil Service would panic if the call went through, and
// uint32(-1) is a different LOD from the one the caller named.
func TestNegativeLodIsNotFound(t *testing.T) {
	srv := New(struct{ Service }{})

	terr, err := srv.GetTerritoryArtifact(context.Background(), GetTerritoryArtifactRequestObject{Slug: "yard", Lod: -1})
	assert.NilError(t, err)
	_, ok := terr.(GetTerritoryArtifact404JSONResponse)
	assert.Assert(t, ok)

	model, err := srv.GetModelArtifact(context.Background(), GetModelArtifactRequestObject{Slug: "pump", Lod: -1})
	assert.NilError(t, err)
	_, ok = model.(GetModelArtifact404JSONResponse)
	assert.Assert(t, ok)
}
