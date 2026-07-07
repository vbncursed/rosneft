package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (s *Server) BeginLogin(ctx context.Context, _ *passkeyv1.BeginLoginRequest) (*passkeyv1.BeginLoginResponse, error) {
	opts, flowID, err := s.svc.BeginLogin(ctx)
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.BeginLoginResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) FinishLogin(ctx context.Context, req *passkeyv1.FinishLoginRequest) (*passkeyv1.FinishLoginResponse, error) {
	uid, err := s.svc.FinishLogin(ctx, req.GetFlowId(), req.GetAssertionJson())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.FinishLoginResponse{UserId: uid}, nil
}
