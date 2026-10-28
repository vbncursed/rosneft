package grpcapi

import (
	"context"
	"fmt"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

// requireUser rejects a request that names no user. The gateway fills user_id
// from the session it authenticated; an empty one means a caller that skipped
// that step, and acting on it would touch the "" row.
func requireUser(userID string) error {
	if userID == "" {
		return mapErr(fmt.Errorf("%w: user_id is required", domain.ErrInvalidInput))
	}
	return nil
}

// Setup provisions a pending secret for the authenticated caller.
func (s *Server) Setup(ctx context.Context, req *twofav1.SetupRequest) (*twofav1.SetupResponse, error) {
	if err := requireUser(req.GetUserId()); err != nil {
		return nil, err
	}
	if req.GetLabel() == "" {
		return nil, mapErr(fmt.Errorf("%w: label is required", domain.ErrInvalidInput))
	}
	secret, url, err := s.svc.Setup(ctx, req.GetUserId(), req.GetLabel())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.SetupResponse{Secret: secret, OtpauthUrl: url}, nil
}

// Enable confirms the pending secret and returns recovery codes.
func (s *Server) Enable(ctx context.Context, req *twofav1.EnableRequest) (*twofav1.EnableResponse, error) {
	if err := requireUser(req.GetUserId()); err != nil {
		return nil, err
	}
	codes, err := s.svc.Enable(ctx, req.GetUserId(), req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.EnableResponse{RecoveryCodes: codes}, nil
}

// Disable turns 2FA off after verifying a current code.
func (s *Server) Disable(ctx context.Context, req *twofav1.DisableRequest) (*twofav1.DisableResponse, error) {
	if err := requireUser(req.GetUserId()); err != nil {
		return nil, err
	}
	if err := s.svc.Disable(ctx, req.GetUserId(), req.GetCode()); err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.DisableResponse{}, nil
}

// RegenerateRecoveryCodes replaces the caller's recovery codes.
func (s *Server) RegenerateRecoveryCodes(
	ctx context.Context,
	req *twofav1.RegenerateRequest,
) (*twofav1.RegenerateResponse, error) {
	if err := requireUser(req.GetUserId()); err != nil {
		return nil, err
	}
	codes, err := s.svc.Regenerate(ctx, req.GetUserId(), req.GetCode())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.RegenerateResponse{RecoveryCodes: codes}, nil
}

// Status reports the caller's own 2FA posture for the account screen.
func (s *Server) Status(ctx context.Context, req *twofav1.StatusRequest) (*twofav1.StatusResponse, error) {
	if err := requireUser(req.GetUserId()); err != nil {
		return nil, err
	}
	st, err := s.svc.Status(ctx, req.GetUserId())
	if err != nil {
		return nil, mapErr(err)
	}
	resp := &twofav1.StatusResponse{
		Enabled:           st.Enabled,
		RecoveryRemaining: int64(st.RecoveryRemaining),
		RecoveryTotal:     int64(st.RecoveryTotal),
	}
	// Zero stays zero when the moment is unknown; the gateway omits the field
	// rather than sending an epoch date.
	if !st.EnabledAt.IsZero() {
		resp.EnabledAt = st.EnabledAt.Unix()
	}
	return resp, nil
}
