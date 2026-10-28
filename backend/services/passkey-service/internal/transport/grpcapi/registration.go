package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (s *Server) BeginRegistration(
	ctx context.Context,
	req *passkeyv1.BeginRegistrationRequest,
) (*passkeyv1.BeginRegistrationResponse, error) {
	if err := requireField("user_id", req.GetUserId()); err != nil {
		return nil, err
	}
	if err := requireField("display_name", req.GetDisplayName()); err != nil {
		return nil, err
	}
	opts, flowID, err := s.svc.BeginRegistration(ctx, req.GetUserId(), req.GetDisplayName())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.BeginRegistrationResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) FinishRegistration(
	ctx context.Context,
	req *passkeyv1.FinishRegistrationRequest,
) (*passkeyv1.FinishRegistrationResponse, error) {
	if err := requireField("user_id", req.GetUserId()); err != nil {
		return nil, err
	}
	c, err := s.svc.FinishRegistration(ctx, req.GetUserId(), req.GetFlowId(), req.GetCredentialJson(), req.GetName())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.FinishRegistrationResponse{Credential: toProto(c)}, nil
}
