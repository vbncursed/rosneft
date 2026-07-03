package grpcapi

import (
	"context"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

// Setup provisions a pending secret for the authenticated caller.
func (s *Server) Setup(ctx context.Context, req *twofav1.SetupRequest) (*twofav1.SetupResponse, error) {
	uid, label, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	secret, url, err := s.svc.Setup(ctx, uid, label)
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.SetupResponse{Secret: secret, OtpauthUrl: url}, nil
}

// Enable confirms the pending secret and returns recovery codes.
func (s *Server) Enable(ctx context.Context, req *twofav1.EnableRequest) (*twofav1.EnableResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	codes, err := s.svc.Enable(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.EnableResponse{RecoveryCodes: codes}, nil
}

// Disable turns 2FA off after verifying a current code.
func (s *Server) Disable(ctx context.Context, req *twofav1.DisableRequest) (*twofav1.DisableResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	if err := s.svc.Disable(ctx, uid, req.GetCode()); err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.DisableResponse{}, nil
}

// RegenerateRecoveryCodes replaces the caller's recovery codes.
func (s *Server) RegenerateRecoveryCodes(ctx context.Context, req *twofav1.RegenerateRequest) (*twofav1.RegenerateResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	codes, err := s.svc.Regenerate(ctx, uid, req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.RegenerateResponse{RecoveryCodes: codes}, nil
}
