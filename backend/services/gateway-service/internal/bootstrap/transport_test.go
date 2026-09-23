package bootstrap

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// RouterBodyLimitSuite checks the body cap is mounted where it covers every
// route, the public /api/auth ones included, not only the /api sub-router.
type RouterBodyLimitSuite struct{ suite.Suite }

func TestRouterBodyLimitSuite(t *testing.T) { suite.Run(t, new(RouterBodyLimitSuite)) }

// A login body is decoded before any session exists, so it is the one an
// anonymous caller can make as large as they like.
func (s *RouterBodyLimitSuite) TestAnOversizedLoginIsRefusedBeforeTheHandler() {
	mc := minimock.NewController(s.T())
	svc := service.New(mocks.NewCatalogMock(mc), mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	discard := slog.New(slog.NewTextHandler(io.Discard, nil))
	// nil auth clients: a request that reached the login handler would panic.
	authH := authhttp.New(nil, nil, nil, nil, discard, authhttp.CookieOptions{}, []byte("test"))
	r, _ := InitRouter(svc, http.NotFoundHandler(), http.NotFoundHandler(), http.NotFoundHandler(), authH, discard, config.Config{}, nil)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(s.T().Context(), http.MethodPost, "/api/auth/login",
		bytes.NewReader(make([]byte, 2<<20)))
	r.ServeHTTP(rec, req)

	assert.Equal(s.T(), rec.Code, http.StatusRequestEntityTooLarge)
}
