package grpcapi

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

// IsEnabled reports whether a user has 2FA on (called by auth during login).
func (s *Server) IsEnabled(ctx context.Context, req *twofav1.IsEnabledRequest) (*twofav1.IsEnabledResponse, error) {
	on, err := s.svc.IsEnabled(ctx, req.GetUserId())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.IsEnabledResponse{Enabled: on}, nil
}

// Verify checks a TOTP or recovery code (called by auth during login).
func (s *Server) Verify(ctx context.Context, req *twofav1.VerifyRequest) (*twofav1.VerifyResponse, error) {
	ok, err := s.svc.Verify(ctx, req.GetUserId(), req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.VerifyResponse{Valid: ok}, nil
}
