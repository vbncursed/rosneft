package authhttp

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

const goodToken = "good-token"

// sessionAuth is an auth-service that knows one session: goodToken is user
// u-7, whose login is alice. Anything else is unauthenticated.
type sessionAuth struct {
	authv1.UnimplementedAuthServiceServer
}

func (sessionAuth) ValidateToken(
	_ context.Context,
	req *authv1.ValidateTokenRequest,
) (*authv1.ValidateTokenResponse, error) {
	if req.GetToken() != goodToken {
		return nil, status.Error(codes.Unauthenticated, "bad session")
	}
	return &authv1.ValidateTokenResponse{UserId: "u-7"}, nil
}

func (sessionAuth) VerifyPassword(
	_ context.Context,
	req *authv1.VerifyPasswordRequest,
) (*authv1.VerifyPasswordResponse, error) {
	return &authv1.VerifyPasswordResponse{Valid: req.GetToken() == goodToken && req.GetPassword() == "pw"}, nil
}

func (sessionAuth) GetMe(_ context.Context, req *authv1.GetMeRequest) (*authv1.User, error) {
	if req.GetToken() != goodToken {
		return nil, status.Error(codes.Unauthenticated, "bad session")
	}
	return &authv1.User{Id: "u-7", Username: "alice"}, nil
}

// recordingTwoFA keeps every request it receives, per RPC.
type recordingTwoFA struct {
	twofav1.UnimplementedTwoFAServiceServer
	mu       sync.Mutex
	setup    []*twofav1.SetupRequest
	enable   []*twofav1.EnableRequest
	disable  []*twofav1.DisableRequest
	regen    []*twofav1.RegenerateRequest
	statuses []*twofav1.StatusRequest
}

func (r *recordingTwoFA) Setup(_ context.Context, q *twofav1.SetupRequest) (*twofav1.SetupResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.setup = append(r.setup, q)
	return &twofav1.SetupResponse{Secret: "S", OtpauthUrl: "otpauth://x"}, nil
}

func (r *recordingTwoFA) Enable(_ context.Context, q *twofav1.EnableRequest) (*twofav1.EnableResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.enable = append(r.enable, q)
	return &twofav1.EnableResponse{RecoveryCodes: []string{"c1"}}, nil
}

func (r *recordingTwoFA) Disable(_ context.Context, q *twofav1.DisableRequest) (*twofav1.DisableResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.disable = append(r.disable, q)
	return &twofav1.DisableResponse{}, nil
}

func (r *recordingTwoFA) RegenerateRecoveryCodes(
	_ context.Context,
	q *twofav1.RegenerateRequest,
) (*twofav1.RegenerateResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.regen = append(r.regen, q)
	return &twofav1.RegenerateResponse{RecoveryCodes: []string{"c2"}}, nil
}

func (r *recordingTwoFA) Status(_ context.Context, q *twofav1.StatusRequest) (*twofav1.StatusResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.statuses = append(r.statuses, q)
	return &twofav1.StatusResponse{Enabled: true}, nil
}

func (r *recordingTwoFA) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.setup) + len(r.enable) + len(r.disable) + len(r.regen) + len(r.statuses)
}

type TwoFARoutesSuite struct {
	suite.Suite
	rec    *recordingTwoFA
	router http.Handler
}

func TestTwoFARoutesSuite(t *testing.T) { suite.Run(t, new(TwoFARoutesSuite)) }

func serve(t *testing.T, register func(*grpc.Server)) string {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	srv := grpc.NewServer()
	register(srv)
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)
	return lis.Addr().String()
}

func (s *TwoFARoutesSuite) SetupTest() {
	s.rec = &recordingTwoFA{}
	authClient, err := auth.Dial(
		serve(s.T(), func(g *grpc.Server) { authv1.RegisterAuthServiceServer(g, sessionAuth{}) }),
	)
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = authClient.Close() })
	twofaClient, err := twofa.Dial(serve(s.T(), func(g *grpc.Server) { twofav1.RegisterTwoFAServiceServer(g, s.rec) }))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = twofaClient.Close() })
	auditClient, err := audit.Dial("127.0.0.1:1")
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = auditClient.Close() })

	h := &Handlers{
		client: authClient, twofa: twofaClient, audit: auditClient,
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	r := chi.NewRouter()
	h.Mount(r)
	s.router = r
}

// do sends a Bearer request (CSRF-exempt by construction) and returns the code.
func (s *TwoFARoutesSuite) do(method, path, token string) int {
	r := httptest.NewRequest(method, path, strings.NewReader(`{"code":"123456"}`))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.router.ServeHTTP(rec, r)
	return rec.Code
}

// The identity twofa acts on is the one the gateway authenticated, never
// anything the client sent.
func (s *TwoFARoutesSuite) TestRoutesPassThePrincipalToTwoFA() {
	t := s.T()
	assert.Equal(t, s.do(http.MethodGet, "/api/auth/2fa", goodToken), http.StatusOK)
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/2fa/setup", goodToken), http.StatusOK)
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/2fa/enable", goodToken), http.StatusOK)
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/2fa/disable", goodToken), http.StatusNoContent)
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/2fa/recovery/regenerate", goodToken), http.StatusOK)

	assert.Equal(t, s.rec.statuses[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.setup[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.setup[0].GetLabel(), "alice", "the otpauth account name is the user's login")
	assert.Equal(t, s.rec.enable[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.enable[0].GetCode(), "123456")
	assert.Equal(t, s.rec.disable[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.disable[0].GetCode(), "123456")
	assert.Equal(t, s.rec.regen[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.regen[0].GetCode(), "123456")
}

func (s *TwoFARoutesSuite) TestUnauthenticatedRequestsNeverReachTwoFA() {
	for _, token := range []string{"", "stolen-or-expired"} {
		for _, route := range []struct{ method, path string }{
			{http.MethodGet, "/api/auth/2fa"},
			{http.MethodPost, "/api/auth/2fa/setup"},
			{http.MethodPost, "/api/auth/2fa/enable"},
			{http.MethodPost, "/api/auth/2fa/disable"},
			{http.MethodPost, "/api/auth/2fa/recovery/regenerate"},
		} {
			assert.Equal(s.T(), s.do(route.method, route.path, token), http.StatusUnauthorized, route.path)
		}
	}
	assert.Equal(s.T(), s.rec.calls(), 0)
}
