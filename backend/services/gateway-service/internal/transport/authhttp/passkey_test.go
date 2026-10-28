package authhttp

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// recordingPasskey keeps every management request it receives.
type recordingPasskey struct {
	passkeyv1.UnimplementedPasskeyServiceServer
	mu     sync.Mutex
	begin  []*passkeyv1.BeginRegistrationRequest
	finish []*passkeyv1.FinishRegistrationRequest
	list   []*passkeyv1.ListCredentialsRequest
	del    []*passkeyv1.DeleteCredentialRequest
}

func (r *recordingPasskey) BeginRegistration(
	_ context.Context,
	q *passkeyv1.BeginRegistrationRequest,
) (*passkeyv1.BeginRegistrationResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.begin = append(r.begin, q)
	return &passkeyv1.BeginRegistrationResponse{OptionsJson: "{}", FlowId: "f1"}, nil
}

func (r *recordingPasskey) FinishRegistration(
	_ context.Context,
	q *passkeyv1.FinishRegistrationRequest,
) (*passkeyv1.FinishRegistrationResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.finish = append(r.finish, q)
	return &passkeyv1.FinishRegistrationResponse{Credential: &passkeyv1.Credential{Id: "c1"}}, nil
}

func (r *recordingPasskey) ListCredentials(
	_ context.Context,
	q *passkeyv1.ListCredentialsRequest,
) (*passkeyv1.ListCredentialsResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.list = append(r.list, q)
	return &passkeyv1.ListCredentialsResponse{}, nil
}

func (r *recordingPasskey) DeleteCredential(
	_ context.Context,
	q *passkeyv1.DeleteCredentialRequest,
) (*passkeyv1.DeleteCredentialResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.del = append(r.del, q)
	return &passkeyv1.DeleteCredentialResponse{}, nil
}

func (r *recordingPasskey) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.begin) + len(r.finish) + len(r.list) + len(r.del)
}

// twofaOff is a twofa-service where nobody has 2FA, so delete steps up by password.
type twofaOff struct {
	twofav1.UnimplementedTwoFAServiceServer
}

func (twofaOff) IsEnabled(context.Context, *twofav1.IsEnabledRequest) (*twofav1.IsEnabledResponse, error) {
	return &twofav1.IsEnabledResponse{}, nil
}

type PasskeyRoutesSuite struct {
	suite.Suite
	rec    *recordingPasskey
	router http.Handler
}

func TestPasskeyRoutesSuite(t *testing.T) { suite.Run(t, new(PasskeyRoutesSuite)) }

func (s *PasskeyRoutesSuite) SetupTest() {
	t := s.T()
	s.rec = &recordingPasskey{}
	authClient, err := auth.Dial(serve(t, func(g *grpc.Server) { authv1.RegisterAuthServiceServer(g, sessionAuth{}) }))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = authClient.Close() })
	pkClient, err := passkey.Dial(serve(t, func(g *grpc.Server) { passkeyv1.RegisterPasskeyServiceServer(g, s.rec) }))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = pkClient.Close() })
	tfClient, err := twofa.Dial(serve(t, func(g *grpc.Server) { twofav1.RegisterTwoFAServiceServer(g, twofaOff{}) }))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = tfClient.Close() })
	auditClient, err := audit.Dial("127.0.0.1:1")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = auditClient.Close() })

	h := &Handlers{
		client: authClient, twofa: tfClient, passkey: pkClient, audit: auditClient,
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	r := chi.NewRouter()
	h.Mount(r)
	s.router = r
}

// do sends a Bearer request (CSRF-exempt by construction) and returns the code.
func (s *PasskeyRoutesSuite) do(method, path, token, body string) int {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.router.ServeHTTP(rec, r)
	return rec.Code
}

// The identity passkey acts on is the one the gateway authenticated, never
// anything the client sent; registration also carries the login, which
// authenticators display.
func (s *PasskeyRoutesSuite) TestRoutesPassThePrincipalToPasskey() {
	t := s.T()
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/passkey/register/begin", goodToken, ""), http.StatusOK)
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/passkey/register/finish", goodToken,
		`{"flowId":"f1","credentialJson":"{}","name":"key","userId":"attacker"}`), http.StatusOK)
	assert.Equal(t, s.do(http.MethodGet, "/api/auth/passkey/credentials", goodToken, ""), http.StatusOK)
	assert.Equal(t, s.do(http.MethodDelete, "/api/auth/passkey/credentials/c1", goodToken, `{"password":"pw"}`),
		http.StatusNoContent)

	assert.Equal(t, s.rec.begin[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.begin[0].GetDisplayName(), "alice", "authenticators show the user's login")
	assert.Equal(t, s.rec.finish[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.finish[0].GetFlowId(), "f1")
	assert.Equal(t, s.rec.finish[0].GetName(), "key")
	assert.Equal(t, s.rec.list[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.del[0].GetUserId(), "u-7")
	assert.Equal(t, s.rec.del[0].GetCredentialId(), "c1")
}

func (s *PasskeyRoutesSuite) TestUnauthenticatedRequestsNeverReachPasskey() {
	for _, token := range []string{"", "stolen-or-expired"} {
		for _, route := range []struct{ method, path string }{
			{http.MethodPost, "/api/auth/passkey/register/begin"},
			{http.MethodPost, "/api/auth/passkey/register/finish"},
			{http.MethodGet, "/api/auth/passkey/credentials"},
			{http.MethodDelete, "/api/auth/passkey/credentials/c1"},
		} {
			assert.Equal(s.T(), s.do(route.method, route.path, token, `{}`), http.StatusUnauthorized, route.path)
		}
	}
	assert.Equal(s.T(), s.rec.calls(), 0)
}
