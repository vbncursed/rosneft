package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// fakeCatalog answers the four calls the client makes for artifacts.
type fakeCatalog struct {
	catalogv1.CatalogServiceClient
	plain      string // plain_hash on the LOD0 artifact returned by Get*
	getErr     error
	gotTerrReq *catalogv1.RegisterTerritoryArtifactRequest
	gotModReq  *catalogv1.RegisterModelArtifactRequest
}

func (f *fakeCatalog) GetTerritoryArtifact(
	context.Context,
	*catalogv1.GetTerritoryArtifactRequest,
	...grpc.CallOption,
) (*catalogv1.GetTerritoryArtifactResponse, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	return &catalogv1.GetTerritoryArtifactResponse{Artifact: &catalogv1.TerritoryArtifact{PlainHash: f.plain}}, nil
}

func (f *fakeCatalog) GetModelArtifact(
	context.Context,
	*catalogv1.GetModelArtifactRequest,
	...grpc.CallOption,
) (*catalogv1.GetModelArtifactResponse, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	return &catalogv1.GetModelArtifactResponse{Artifact: &catalogv1.ModelArtifact{PlainHash: f.plain}}, nil
}

func (f *fakeCatalog) RegisterTerritoryArtifact(
	_ context.Context,
	in *catalogv1.RegisterTerritoryArtifactRequest,
	_ ...grpc.CallOption,
) (*catalogv1.RegisterTerritoryArtifactResponse, error) {
	f.gotTerrReq = in
	return &catalogv1.RegisterTerritoryArtifactResponse{}, nil
}

func (f *fakeCatalog) RegisterModelArtifact(
	_ context.Context,
	in *catalogv1.RegisterModelArtifactRequest,
	_ ...grpc.CallOption,
) (*catalogv1.RegisterModelArtifactResponse, error) {
	f.gotModReq = in
	return &catalogv1.RegisterModelArtifactResponse{}, nil
}

type ClientSuite struct{ suite.Suite }

func TestClientSuite(t *testing.T) { suite.Run(t, new(ClientSuite)) }

func (s *ClientSuite) TestHasLOD0() {
	tests := []struct {
		name         string
		plain        string
		getErr       error
		has, hasPlan bool
		wantErr      bool
	}{
		{name: "with plain", plain: "p", has: true, hasPlan: true},
		{name: "without plain", has: true},
		{name: "not found", getErr: status.Error(codes.NotFound, "no artifact")},
		{name: "unavailable", getErr: status.Error(codes.Unavailable, "down"), wantErr: true},
	}
	for _, kind := range []domain.Kind{domain.KindTerritory, domain.KindModel} {
		for _, tt := range tests {
			s.Run(kind.String()+"/"+tt.name, func() {
				c := &Client{cc: &fakeCatalog{plain: tt.plain, getErr: tt.getErr}}

				has, hasPlain, err := c.HasLOD0(s.T().Context(), kind, "x")

				assert.Equal(s.T(), err != nil, tt.wantErr)
				assert.Equal(s.T(), has, tt.has)
				assert.Equal(s.T(), hasPlain, tt.hasPlan)
			})
		}
	}
}

func (s *ClientSuite) TestRegisterArtifactSendsThePlainHash() {
	f := &fakeCatalog{}
	c := &Client{cc: f}

	assert.NilError(
		s.T(),
		c.RegisterArtifact(s.T().Context(), domain.Artifact{Kind: domain.KindTerritory, Slug: "t", PlainHash: "p"}),
	)
	assert.NilError(
		s.T(),
		c.RegisterArtifact(s.T().Context(), domain.Artifact{Kind: domain.KindModel, Slug: "m", PlainHash: "q"}),
	)

	assert.Equal(s.T(), f.gotTerrReq.GetArtifact().GetPlainHash(), "p")
	assert.Equal(s.T(), f.gotModReq.GetArtifact().GetPlainHash(), "q")
}
