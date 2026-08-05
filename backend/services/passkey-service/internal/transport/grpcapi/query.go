package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// CredentialedUsers is internal surface: keyed on ids, not on a session token,
// because the question is about other users. It leaks nothing beyond the fact
// that a factor is configured — no names, no counts, no key material.
func (s *Server) CredentialedUsers(ctx context.Context, req *passkeyv1.CredentialedUsersRequest) (*passkeyv1.CredentialedUsersResponse, error) {
	ids, err := s.svc.CredentialedUsers(ctx, req.GetUserIds())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.CredentialedUsersResponse{UserIdsWithCredentials: ids}, nil
}
