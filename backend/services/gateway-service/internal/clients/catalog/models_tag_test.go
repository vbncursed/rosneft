// In-package test: zoneCC (zones_test.go) stands in for the gRPC client.
package catalog

import (
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *ZonesSuite) TestUpsertModelSendsTheTagSlugAndReadsTheTag() {
	cc := &zoneCC{}
	m := domain.Model{Title: "Cabin", SourceBlobHash: "h", Tag: domain.ModelTag{Slug: "camp"}}

	got, err := (&Client{cc: cc}).UpsertModel(s.T().Context(), m)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.upsert.GetTagSlug(), "camp")
	assert.Equal(s.T(), got.Tag, domain.ModelTag{Slug: "camp", Title: "Camp & accommodation"})
}

func (s *ZonesSuite) TestUpsertModelUnknownTagKeepsTheCatalogsWords() {
	cc := &zoneCC{err: status.Error(codes.InvalidArgument, "invalid input: unknown model tag")}

	_, err := (&Client{cc: cc}).UpsertModel(s.T().Context(), domain.Model{Tag: domain.ModelTag{Slug: "nope"}})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.Equal(s.T(), err.Error(), "invalid input: unknown model tag")
}

func (s *ZonesSuite) TestUpdateModelSendsTheTagSlug() {
	cc := &zoneCC{}

	_, err := (&Client{cc: cc}).UpdateModel(s.T().Context(), "cabin", domain.ModelUpdate{TagSlug: new("power")})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.patch.GetTagSlug(), "power")
	assert.Assert(s.T(), cc.patch.Title == nil)
}
