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

func (s *Server) MarkTourSeen(ctx context.Context, req *authv1.MarkTourSeenRequest) (*authv1.MarkTourSeenResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.MarkTourSeen(ctx, uid, req.GetTour()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.MarkTourSeenResponse{}, nil
}

func (s *Server) VerifyPassword(ctx context.Context, req *authv1.VerifyPasswordRequest) (*authv1.VerifyPasswordResponse, error) {
	ok, err := s.auth.VerifyPassword(ctx, req.GetToken(), req.GetPassword())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.VerifyPasswordResponse{Valid: ok}, nil
}
