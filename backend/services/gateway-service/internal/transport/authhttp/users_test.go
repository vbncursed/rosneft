package authhttp

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// passwordAuth is an in-process auth-service that records the request it is
// sent and answers with err.
type passwordAuth struct {
	authv1.UnimplementedAuthServiceServer
	got chan *authv1.SetUserPasswordRequest
	err error
}

func newPasswordAuth(err error) passwordAuth {
	return passwordAuth{got: make(chan *authv1.SetUserPasswordRequest, 1), err: err}
}

func (p passwordAuth) SetUserPassword(_ context.Context, req *authv1.SetUserPasswordRequest) (*authv1.SetUserPasswordResponse, error) {
	p.got <- req
	if p.err != nil {
		return nil, p.err
	}
	return &authv1.SetUserPasswordResponse{}, nil
}

type SetUserPasswordSuite struct{ suite.Suite }

func TestSetUserPasswordSuite(t *testing.T) { suite.Run(t, new(SetUserPasswordSuite)) }

// put sends one PUT through the handler on its real route pattern, with
// auth-service answering from stub over loopback. Authenticate, CSRF and the
// users:write gate belong to Mount and are not what this suite tests.
func (s *SetUserPasswordSuite) put(stub passwordAuth, body string) *httptest.ResponseRecorder {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(srv, stub)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)
	client, err := auth.Dial(lis.Addr().String())
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = client.Close() })

	r := chi.NewRouter()
	r.Put("/api/auth/users/{id}/password", (&Handlers{client: client}).setUserPassword)
	req := httptest.NewRequest(http.MethodPut, "/api/auth/users/u-1/password", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func (s *SetUserPasswordSuite) TestForwardsTargetPasswordAndSessionThenAnswers204() {
	stub := newPasswordAuth(nil)

	rec := s.put(stub, `{"password":"N3w-Passw0rd!"}`)

	assert.Equal(s.T(), rec.Code, http.StatusNoContent)
	var got *authv1.SetUserPasswordRequest
	select {
	case got = <-stub.got:
	case <-time.After(5 * time.Second):
		s.T().Fatal("auth-service never received SetUserPassword")
	}
	assert.Equal(s.T(), got.GetToken(), "tok")
	assert.Equal(s.T(), got.GetId(), "u-1")
	assert.Equal(s.T(), got.GetPassword(), "N3w-Passw0rd!")
}

// auth-service's refusal reaches the caller under its own status: the
// self-target guard is a 422, not a generic 500.
func (s *SetUserPasswordSuite) TestPassesTheRefusalThrough() {
	stub := newPasswordAuth(status.Error(codes.FailedPrecondition, "cannot perform this action on yourself"))

	rec := s.put(stub, `{"password":"N3w-Passw0rd!"}`)

	assert.Equal(s.T(), rec.Code, http.StatusUnprocessableEntity)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "yourself"))
}

func (s *SetUserPasswordSuite) TestRefusesABodyThatIsNotJSONWithoutCallingAuth() {
	stub := newPasswordAuth(nil)

	rec := s.put(stub, "password=x")

	assert.Equal(s.T(), rec.Code, http.StatusBadRequest)
	assert.Equal(s.T(), len(stub.got), 0)
}
