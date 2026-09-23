// In-package test: it substitutes the unexported gRPC stub on Client
// (updateCC lives in stub_test.go).
package catalog

import (
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

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
