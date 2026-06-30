package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) Login(ctx context.Context, req *authv1.LoginRequest) (*authv1.LoginResponse, error) {
	token, challenge, err := s.auth.Login(ctx, req.GetIdentifier(), req.GetPassword())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.LoginResponse{
		Token:             token,
		TwoFactorRequired: challenge != "",
		ChallengeToken:    challenge,
	}, nil
}

func (s *Server) LoginVerify2FA(ctx context.Context, req *authv1.LoginVerify2FARequest) (*authv1.LoginResponse, error) {
	token, err := s.auth.LoginVerify2FA(ctx, req.GetChallengeToken(), req.GetCode())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.LoginResponse{Token: token}, nil
}

func (s *Server) Logout(ctx context.Context, req *authv1.LogoutRequest) (*authv1.LogoutResponse, error) {
	if err := s.auth.Logout(ctx, req.GetToken()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.LogoutResponse{}, nil
}

func (s *Server) ValidateToken(ctx context.Context, req *authv1.ValidateTokenRequest) (*authv1.ValidateTokenResponse, error) {
	uid, perms, isOwner, err := s.auth.ValidateToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	return &authv1.ValidateTokenResponse{UserId: uid, Permissions: perms, IsOwner: isOwner}, nil
}
