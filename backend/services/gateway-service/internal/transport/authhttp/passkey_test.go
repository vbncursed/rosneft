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

// stepTwoFA is a twofa-service whose 2FA state the test sets: with 2FA off the
// step-up is the password, with it on only the code "123456" passes. It keeps
// the user ids Verify saw, so a test can tell the limiter-guarded RPC was used.
type stepTwoFA struct {
	twofav1.UnimplementedTwoFAServiceServer
	mu       sync.Mutex
	enabled  bool
	verified []string
}

func (f *stepTwoFA) IsEnabled(context.Context, *twofav1.IsEnabledRequest) (*twofav1.IsEnabledResponse, error) {
	return &twofav1.IsEnabledResponse{Enabled: f.enabled}, nil
}

func (f *stepTwoFA) Verify(_ context.Context, q *twofav1.VerifyRequest) (*twofav1.VerifyResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.verified = append(f.verified, q.GetUserId())
	return &twofav1.VerifyResponse{Valid: q.GetCode() == "123456"}, nil
}

type PasskeyRoutesSuite struct {
	suite.Suite
	rec    *recordingPasskey
	tf     *stepTwoFA
	router http.Handler
}

func TestPasskeyRoutesSuite(t *testing.T) { suite.Run(t, new(PasskeyRoutesSuite)) }

func (s *PasskeyRoutesSuite) SetupTest() {
	t := s.T()
	s.rec = &recordingPasskey{}
	s.tf = &stepTwoFA{}
	authClient, err := auth.Dial(serve(t, func(g *grpc.Server) { authv1.RegisterAuthServiceServer(g, sessionAuth{}) }))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = authClient.Close() })
	pkClient, err := passkey.Dial(serve(t, func(g *grpc.Server) { passkeyv1.RegisterPasskeyServiceServer(g, s.rec) }))
	assert.NilError(t, err)
	t.Cleanup(func() { _ = pkClient.Close() })
	tfClient, err := twofa.Dial(serve(t, func(g *grpc.Server) { twofav1.RegisterTwoFAServiceServer(g, s.tf) }))
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
	assert.Equal(t, s.do(http.MethodPost, "/api/auth/passkey/register/begin", goodToken, `{"password":"pw"}`),
		http.StatusOK)
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

const (
	beginPath  = "/api/auth/passkey/register/begin"
	deletePath = "/api/auth/passkey/credentials/c1"
)

// Registering a key is as dangerous as deleting one (a stolen session could
// enrol the attacker's own key, which then bypasses 2FA and outlives a password
// change), so begin asks for the same factor and never starts the ceremony
// without it.
func (s *PasskeyRoutesSuite) TestRegisterBeginNeedsStepUp() {
	for _, tc := range []struct {
		name    string
		enabled bool
		body    string
		want    int
	}{
		{"no body", false, ``, http.StatusBadRequest},
		{"empty factor", false, `{}`, http.StatusForbidden},
		{"wrong password", false, `{"password":"nope"}`, http.StatusForbidden},
		{"2FA on, password alone", true, `{"password":"pw"}`, http.StatusForbidden},
		{"2FA on, wrong code", true, `{"code":"000000"}`, http.StatusForbidden},
		{"2FA on, code ignores a good password", true, `{"password":"pw","code":"000000"}`, http.StatusForbidden},
	} {
		s.Run(tc.name, func() {
			s.tf.enabled = tc.enabled
			assert.Equal(s.T(), s.do(http.MethodPost, beginPath, goodToken, tc.body), tc.want)
			assert.Equal(s.T(), len(s.rec.begin), 0, "the ceremony must not start")
		})
	}
}

func (s *PasskeyRoutesSuite) TestRegisterBeginProceedsWithTheRightFactor() {
	t := s.T()
	assert.Equal(t, s.do(http.MethodPost, beginPath, goodToken, `{"password":"pw"}`), http.StatusOK)
	s.tf.enabled = true
	assert.Equal(t, s.do(http.MethodPost, beginPath, goodToken, `{"code":"123456"}`), http.StatusOK)
	assert.Equal(t, len(s.rec.begin), 2)
}

// Begin and delete must spend the same twofa Verify budget (twofa-service's
// limiter keys on the user), so guessing codes through one cannot dodge the
// cap on the other.
func (s *PasskeyRoutesSuite) TestStepUpSharesTheVerifyPathWithDelete() {
	t := s.T()
	s.tf.enabled = true
	s.do(http.MethodPost, beginPath, goodToken, `{"code":"000000"}`)
	s.do(http.MethodDelete, deletePath, goodToken, `{"code":"000000"}`)
	assert.DeepEqual(t, s.tf.verified, []string{"u-7", "u-7"})
	assert.Equal(t, len(s.rec.del), 0)
}

func (s *PasskeyRoutesSuite) TestDeleteRefusesAWrongFactor() {
	assert.Equal(s.T(), s.do(http.MethodDelete, deletePath, goodToken, `{"password":"nope"}`), http.StatusForbidden)
	assert.Equal(s.T(), len(s.rec.del), 0)
}
