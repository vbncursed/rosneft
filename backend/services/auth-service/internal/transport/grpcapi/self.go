package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) GetMe(ctx context.Context, req *authv1.GetMeRequest) (*authv1.User, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Get(ctx, uid, true, uid) // self-read bypasses the owner scope
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ChangePassword(ctx context.Context, req *authv1.ChangePasswordRequest) (*authv1.ChangePasswordResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.ChangePassword(ctx, uid, req.GetOldPassword(), req.GetNewPassword()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.ChangePasswordResponse{}, nil
}
