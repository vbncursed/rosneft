package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// ResolveUserLogins maps user ids to logins for a caller that already sees those
// ids.
//
// The token is validated and then its scope is dropped on the floor — that is
// the whole point of this RPC, and the reason it exists next to ListUsers rather
// than as an option on it. Validating anyway is not ceremony: without it the
// call would hand out every login to anything that reached the port, and auth
// being off the host network is one layer, not two.
func (s *Server) ResolveUserLogins(
	ctx context.Context, req *authv1.ResolveUserLoginsRequest,
) (*authv1.ResolveUserLoginsResponse, error) {
	if _, _, err := s.actor(ctx, req.GetToken()); err != nil {
		return nil, mapError(err)
	}
	logins, err := s.users.ResolveLogins(ctx, req.GetIds())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ResolveUserLoginsResponse{Logins: logins}, nil
}
