package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// BlobGateSuite covers the middleware that stops a hash from opening another
// tenant's bytes. It mirrors TerritoryGateSuite's shape on purpose — the two
// gates answer the same way and must not drift apart.
type BlobGateSuite struct {
	suite.Suite
}

func TestBlobGateSuite(t *testing.T) { suite.Run(t, new(BlobGateSuite)) }

type blobCase struct {
	adminID   string
	allAccess bool
}

// router mounts the gate the way InitRouter does: on the asset routes only,
// after Authenticate. chi must have matched the route before the middleware
// runs, or chi.URLParam("hash") comes back empty.
func (s *BlobGateSuite) router(svc Service, c blobCase) http.Handler {
	srv := New(svc)
	r := chi.NewRouter()
	inject := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if c.allAccess {
				ctx = authhttp.NewTestContext(ctx, true, "")
			} else {
				ctx = authhttp.NewTestContext(ctx, false, c.adminID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	}
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
	r.With(inject, srv.RequireBlobAccess).Get("/api/assets/{hash}", ok)
	r.With(inject, srv.RequireBlobAccess).Head("/api/assets/{hash}", ok)
	return r
}

func (s *BlobGateSuite) do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func (s *BlobGateSuite) TestReachableBlobIsServed() {
	svc := blobServiceStub{resolve: func(_ context.Context, hash, scope string) (bool, error) {
		assert.Equal(s.T(), hash, "abc123")
		assert.Equal(s.T(), scope, "admin-1", "the gate must pass the principal's scope")
		return true, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{adminID: "admin-1"}),
		http.MethodGet, "/api/assets/abc123").Code, http.StatusOK)
}

// The point of the whole middleware.
func (s *BlobGateSuite) TestUnreachableBlobIsRefusedAsMissing() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		return false, nil
	}}
	h := s.router(svc, blobCase{adminID: "admin-1"})

	for _, m := range []string{http.MethodGet, http.MethodHead} {
		rec := s.do(h, m, "/api/assets/theirs")
		assert.Equal(s.T(), rec.Code, http.StatusNotFound, "%s", m)
		if m == http.MethodGet {
			// 403 would confirm the blob exists. The body must match a hash that
			// belongs to nothing at all.
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
		}
	}
}

func (s *BlobGateSuite) TestRootSkipsTheLookupEntirely() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		s.T().Fatal("Root must not cost a catalog round trip")
		return false, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{allAccess: true}),
		http.MethodGet, "/api/assets/any").Code, http.StatusOK)
}

// Fail closed: an empty scope on a non-Root principal would disable the
// catalog's filter and open every blob in the system.
func (s *BlobGateSuite) TestPrincipalWithoutACompanyIsRefused() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		s.T().Fatal("an unscoped principal must be refused before the lookup")
		return false, nil
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{}),
		http.MethodGet, "/api/assets/x").Code, http.StatusNotFound)
}

// A catalog that is down must not read as "allowed". It must also not read as a
// plain 404, which would tell the caller their own asset had vanished.
func (s *BlobGateSuite) TestCatalogFailureFailsClosedWithoutClaimingTheBlobIsMissing() {
	svc := blobServiceStub{resolve: func(context.Context, string, string) (bool, error) {
		return false, errors.New("catalog unreachable")
	}}

	assert.Equal(s.T(), s.do(s.router(svc, blobCase{adminID: "admin-1"}),
		http.MethodGet, "/api/assets/abc").Code, http.StatusServiceUnavailable)
}

// blobServiceStub implements only what the gate calls. Embedding Service leaves
// every other method nil, so a call to one panics — the desired signal.
type blobServiceStub struct {
	Service
	resolve func(ctx context.Context, hash, scope string) (bool, error)
}

func (b blobServiceStub) ResolveBlobAccess(ctx context.Context, hash, scope string) (bool, error) {
	return b.resolve(ctx, hash, scope)
}
