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
	u, err := s.users.Get(ctx, uid)
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

func (s *Server) Setup2FA(ctx context.Context, req *authv1.Setup2FARequest) (*authv1.Setup2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	secretPlain, url, err := s.twofa.Setup(ctx, uid)
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.Setup2FAResponse{Secret: secretPlain, OtpauthUrl: url}, nil
}

func (s *Server) Enable2FA(ctx context.Context, req *authv1.Enable2FARequest) (*authv1.Enable2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	codes, err := s.twofa.Enable(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.Enable2FAResponse{RecoveryCodes: codes}, nil
}

func (s *Server) Disable2FA(ctx context.Context, req *authv1.Disable2FARequest) (*authv1.Disable2FAResponse, error) {
	uid, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.twofa.Disable(ctx, uid, req.GetCode()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.Disable2FAResponse{}, nil
}
