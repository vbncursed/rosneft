package authhttp

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// passwordStub answers a session per token and counts the resets that reached
// it: "writer" holds users:write, "reader" only users:read.
type passwordStub struct {
	authv1.UnimplementedAuthServiceServer
	resets *atomic.Int32
}

func (passwordStub) ValidateToken(_ context.Context, req *authv1.ValidateTokenRequest) (*authv1.ValidateTokenResponse, error) {
	perms := map[string][]string{"writer": {"users:write"}, "reader": {"users:read"}}[req.GetToken()]
	return &authv1.ValidateTokenResponse{UserId: "u-" + req.GetToken(), Permissions: perms}, nil
}

func (p passwordStub) SetUserPassword(context.Context, *authv1.SetUserPasswordRequest) (*authv1.SetUserPasswordResponse, error) {
	p.resets.Add(1)
	return &authv1.SetUserPasswordResponse{}, nil
}

// Setting someone else's password signs you in as them, so the route must sit
// behind users:write and the CSRF check. Driven through Mount, not the bare
// handler: the gates are the router's, and a route moved out of the group
// would pass a handler-level test while losing both.
func TestSetUserPasswordIsGatedByUsersWriteAndCSRF(t *testing.T) {
	resets := &atomic.Int32{}
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	srv := grpc.NewServer()
	authv1.RegisterAuthServiceServer(srv, passwordStub{resets: resets})
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)
	client, err := auth.Dial(lis.Addr().String())
	assert.NilError(t, err)
	t.Cleanup(func() { _ = client.Close() })

	h := &Handlers{client: client, logger: slog.New(slog.NewTextHandler(io.Discard, nil)), csrfSecret: []byte("k")}
	r := chi.NewRouter()
	h.Mount(r)

	for _, tc := range []struct {
		name  string
		token string
		csrf  bool
		want  int
		reset bool
	}{
		{name: "users:read is refused", token: "reader", csrf: true, want: http.StatusForbidden},
		{name: "a missing CSRF token is refused", token: "writer", want: http.StatusForbidden},
		{name: "users:write with CSRF resets", token: "writer", csrf: true, want: http.StatusNoContent, reset: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := resets.Load()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/api/auth/users/u2/password",
				bytes.NewBufferString(`{"password":"N3w-Passw0rd!"}`))
			req.Header.Set("Content-Type", "application/json")
			req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: tc.token})
			if tc.csrf {
				req.Header.Set(csrfHeaderName, h.CSRFToken(tc.token))
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			assert.Equal(t, rec.Code, tc.want, rec.Body.String())
			assert.Equal(t, resets.Load()-before == 1, tc.reset, "reached auth-service")
		})
	}
}
