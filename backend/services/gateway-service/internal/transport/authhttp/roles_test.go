package authhttp

import (
	"bytes"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
)

// rolesStub hands the UpdateRole request it received back to the test. The
// channel, not a field, because the gRPC server answers on its own goroutine.
type rolesStub struct {
	authv1.UnimplementedAuthServiceServer
	got chan *authv1.UpdateRoleRequest
}

func (r rolesStub) UpdateRole(_ context.Context, req *authv1.UpdateRoleRequest) (*authv1.Role, error) {
	r.got <- req
	return &authv1.Role{Slug: req.GetSlug(), Title: req.GetTitle(), PermissionSlugs: req.GetPermissionSlugs()}, nil
}

type RolesSuite struct{ suite.Suite }

func TestRolesSuite(t *testing.T) { suite.Run(t, new(RolesSuite)) }

// patch drives PATCH /api/auth/roles/{slug} against a loopback auth-service and
// returns what that service was asked. Authenticate, CSRF and the roles:manage
// gate belong to Mount and are not what this suite tests.
func (s *RolesSuite) patch(body string) (*httptest.ResponseRecorder, *authv1.UpdateRoleRequest) {
	stub := rolesStub{got: make(chan *authv1.UpdateRoleRequest, 1)}
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
	r.Patch("/api/auth/roles/{slug}", (&Handlers{client: client}).updateRole)
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(s.T().Context(), http.MethodPatch, "/api/auth/roles/viewer", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)
	return rec, <-stub.got
}

func (s *RolesSuite) TestATitleAloneLeavesTheGrants() {
	rec, got := s.patch(`{"title":"Viewer"}`)
	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Equal(s.T(), got.GetSlug(), "viewer")
	assert.Equal(s.T(), got.GetTitle(), "Viewer")
	assert.Assert(s.T(), !got.GetReplacePermissions())
}

func (s *RolesSuite) TestPermissionsTravelWithTheTitle() {
	rec, got := s.patch(`{"title":"Viewer","permissionSlugs":["territory:read"]}`)
	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Assert(s.T(), got.GetReplacePermissions())
	assert.DeepEqual(s.T(), got.GetPermissionSlugs(), []string{"territory:read"})
}

// [] is a real request, "strip every grant", and must not read as "absent".
func (s *RolesSuite) TestAnEmptyListStillReplaces() {
	_, got := s.patch(`{"title":"Viewer","permissionSlugs":[]}`)
	assert.Assert(s.T(), got.GetReplacePermissions())
	assert.Equal(s.T(), len(got.GetPermissionSlugs()), 0)
}
