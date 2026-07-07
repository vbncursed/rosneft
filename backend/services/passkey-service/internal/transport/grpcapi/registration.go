package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

func (s *Server) BeginRegistration(ctx context.Context, req *passkeyv1.BeginRegistrationRequest) (*passkeyv1.BeginRegistrationResponse, error) {
	uid, name, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	opts, flowID, err := s.svc.BeginRegistration(ctx, uid, name)
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.BeginRegistrationResponse{OptionsJson: opts, FlowId: flowID}, nil
}

func (s *Server) FinishRegistration(ctx context.Context, req *passkeyv1.FinishRegistrationRequest) (*passkeyv1.FinishRegistrationResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	c, err := s.svc.FinishRegistration(ctx, uid, req.GetFlowId(), req.GetCredentialJson(), req.GetName())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.FinishRegistrationResponse{Credential: toProto(c)}, nil
}
