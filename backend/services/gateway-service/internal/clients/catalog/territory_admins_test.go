// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// adminsCC answers with pairs interleaved across territories, as a map walk on
// the catalog side may send them.
type adminsCC struct {
	catalogv1.CatalogServiceClient
	asked []string
}

func (a *adminsCC) ListTerritoryAdmins(
	_ context.Context, in *catalogv1.ListTerritoryAdminsRequest, _ ...grpc.CallOption,
) (*catalogv1.ListTerritoryAdminsResponse, error) {
	a.asked = in.GetSlugs()
	return &catalogv1.ListTerritoryAdminsResponse{Admins: []*catalogv1.TerritoryAdmin{
		{TerritorySlug: "a", AdminUserId: "u1"},
		{TerritorySlug: "b", AdminUserId: "u2"},
		{TerritorySlug: "a", AdminUserId: "u3"},
	}}, nil
}

type TerritoryAdminsSuite struct{ suite.Suite }

func TestTerritoryAdminsSuite(t *testing.T) { suite.Run(t, new(TerritoryAdminsSuite)) }

func (s *TerritoryAdminsSuite) TestPairsAreGroupedBySlugInOrder() {
	cc := &adminsCC{}
	got, err := (&Client{cc: cc}).ListTerritoryAdmins(s.T().Context(), []string{"a", "b", "c"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), cc.asked, []string{"a", "b", "c"})
	assert.DeepEqual(s.T(), got, map[string][]string{"a": {"u1", "u3"}, "b": {"u2"}})
}
