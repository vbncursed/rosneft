package bootstrap

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

// SpecCoverageSuite guards the one drift that fails silently: a route exists on
// the router but not in the OpenAPI document. Routing keeps working, so nothing
// breaks in dev — the endpoint is just invisible in /docs and absent from the
// frontend's generated client. Editing api/openapi.yaml alone is not enough
// either; the served spec is embedded at build time by `make openapi-gen`, and
// this suite reads that embedded copy, so a stale regeneration fails here too.
type SpecCoverageSuite struct {
	suite.Suite
	router chi.Router
}

func TestSpecCoverageSuite(t *testing.T) {
	suite.Run(t, new(SpecCoverageSuite))
}

func (s *SpecCoverageSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	svc := service.New(
		mocks.NewCatalogMock(mc),
		mocks.NewContentMock(mc),
		mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc),
		mocks.NewAuditMock(mc),
		mocks.NewAuthMock(mc),
	)
	// The gRPC clients are nil and the handlers are never invoked: Mount only
	// registers them. grpc.NewClient is lazy anyway, so even a real client here
	// would not need a live backend.
	authH := authhttp.New(nil, nil, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)),
		authhttp.CookieOptions{})
	r, _ := InitRouter(svc, http.NotFoundHandler(), http.NotFoundHandler(), authH,
		slog.New(slog.NewTextHandler(io.Discard, nil)), config.Config{})
	s.router = r
}

func (s *SpecCoverageSuite) TestEveryRouteIsDocumented() {
	sw, err := httpapi.GetSpec()
	assert.NilError(s.T(), err)

	var undocumented []string
	err = chi.Walk(s.router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		route = normalizeRoute(route)
		if route == "" {
			return nil
		}
		item := sw.Paths.Find(route)
		if item == nil {
			undocumented = append(undocumented, method+" "+route+" (path missing)")
			return nil
		}
		if _, ok := item.Operations()[method]; !ok {
			undocumented = append(undocumented, method+" "+route+" (method missing)")
		}
		return nil
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 0, len(undocumented),
		"routes on the router but not in the embedded OpenAPI spec: %v\n"+
			"add them to api/openapi.yaml, then run `make openapi-gen`", undocumented)
}

// normalizeRoute maps a chi pattern onto its OpenAPI path. chi appends a
// trailing slash to patterns registered under a sub-router; returns "" for
// routes that are deliberately not part of the documented surface.
func normalizeRoute(route string) string {
	if len(route) > 1 {
		route = strings.TrimSuffix(route, "/")
	}
	if route == "" || route == "/*" {
		return ""
	}
	return route
}
