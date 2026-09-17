package httpapi

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// BlobScopeSuite checks that every handler taking a blob hash hands the
// caller's scope to the service, which decides whether the hash may be
// attached (H-1). A handler passing a zero scope would refuse everyone; one
// passing AllAccess would wave everyone through.
type BlobScopeSuite struct{ suite.Suite }

func TestBlobScopeSuite(t *testing.T) { suite.Run(t, new(BlobScopeSuite)) }

// scopeRecorder captures the scope each hash-taking call received and answers
// with the service's refusal, so the test also sees how the handler maps it.
type scopeRecorder struct {
	Service
	scope *domain.BlobScope
}

var errForeignBlob = errors.Join(domain.ErrInvalidInput, errors.New("unknown blob hash"))

func (r scopeRecorder) CreateTerritory(_ context.Context, _ domain.Territory, sc domain.BlobScope) (domain.Territory, domain.Job, error) {
	*r.scope = sc
	return domain.Territory{}, domain.Job{}, errForeignBlob
}

func (r scopeRecorder) ReplaceTerritorySource(_ context.Context, _, _ string, sc domain.BlobScope) (domain.Territory, domain.Job, error) {
	*r.scope = sc
	return domain.Territory{}, domain.Job{}, errForeignBlob
}

func (r scopeRecorder) CreateModel(_ context.Context, _ domain.Model, sc domain.BlobScope) (domain.Model, domain.Job, error) {
	*r.scope = sc
	return domain.Model{}, domain.Job{}, errForeignBlob
}

func (r scopeRecorder) UpdateModel(_ context.Context, _ string, _ domain.ModelUpdate, sc domain.BlobScope) (domain.Model, error) {
	*r.scope = sc
	return domain.Model{}, errForeignBlob
}

func (r scopeRecorder) CreatePanorama(_ context.Context, _ domain.Panorama, sc domain.BlobScope) (domain.Panorama, error) {
	*r.scope = sc
	return domain.Panorama{}, errForeignBlob
}

func (r scopeRecorder) CreateDocument(_ context.Context, _ domain.Document, sc domain.BlobScope) (domain.Document, error) {
	*r.scope = sc
	return domain.Document{}, errForeignBlob
}

func (s *BlobScopeSuite) TestEveryHashTakingRouteForwardsTheScopeAndAnswers400() {
	const hash = "h"
	cases := []struct {
		name string
		call func(context.Context, *Server) (any, error)
		want any
	}{
		{name: "create territory", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.CreateTerritory(ctx, CreateTerritoryRequestObject{Body: &CreateTerritoryJSONRequestBody{Title: "t", SourceBlobHash: hash}})
		}, want: CreateTerritory400JSONResponse{}},
		{name: "replace territory source", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.ReplaceTerritorySource(ctx, ReplaceTerritorySourceRequestObject{Slug: "yard", Body: &ReplaceTerritorySourceJSONRequestBody{SourceBlobHash: hash}})
		}, want: ReplaceTerritorySource400JSONResponse{}},
		{name: "create model", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.CreateModel(ctx, CreateModelRequestObject{Body: &CreateModelJSONRequestBody{Title: "m", SourceBlobHash: hash}})
		}, want: CreateModel400JSONResponse{}},
		{name: "update model", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.UpdateModel(ctx, UpdateModelRequestObject{Slug: "pump", Body: &UpdateModelJSONRequestBody{ThumbnailBlobHash: new(hash)}})
		}, want: UpdateModel400JSONResponse{}},
		{name: "create panorama", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.CreatePanorama(ctx, CreatePanoramaRequestObject{Slug: "yard", Body: &CreatePanoramaJSONRequestBody{Title: "p", SourceBlobHash: hash}})
		}, want: CreatePanorama400JSONResponse{}},
		{name: "create document", call: func(ctx context.Context, srv *Server) (any, error) {
			return srv.CreateDocument(ctx, CreateDocumentRequestObject{Slug: "yard", Body: &CreateDocumentJSONRequestBody{Title: "d", SourceBlobHash: hash}})
		}, want: CreateDocument400JSONResponse{}},
	}
	principals := []struct {
		name string
		ctx  func(context.Context) context.Context
		want domain.BlobScope
	}{
		{name: "company owner", want: domain.BlobScope{AdminID: "company-1"}, ctx: func(ctx context.Context) context.Context {
			return authhttp.NewTestContext(ctx, false, "company-1")
		}},
		{name: "root", want: domain.BlobScope{AllAccess: true}, ctx: func(ctx context.Context) context.Context {
			return authhttp.NewTestContext(ctx, true, "")
		}},
	}
	for _, tc := range cases {
		for _, p := range principals {
			s.Run(tc.name+" as "+p.name, func() {
				var got domain.BlobScope
				resp, err := tc.call(p.ctx(s.T().Context()), New(scopeRecorder{scope: &got}))
				assert.NilError(s.T(), err)
				assert.Equal(s.T(), got, p.want)
				assert.Equal(s.T(), fmt.Sprintf("%T", resp), fmt.Sprintf("%T", tc.want))
			})
		}
	}
}
