package grpcapi

import (
	"context"
	"encoding/base64"
	"time"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

func (s *Server) ListCredentials(ctx context.Context, req *passkeyv1.ListCredentialsRequest) (*passkeyv1.ListCredentialsResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	creds, err := s.svc.List(ctx, uid)
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]*passkeyv1.Credential, 0, len(creds))
	for _, c := range creds {
		out = append(out, toProto(c))
	}
	return &passkeyv1.ListCredentialsResponse{Credentials: out}, nil
}

func (s *Server) DeleteCredential(ctx context.Context, req *passkeyv1.DeleteCredentialRequest) (*passkeyv1.DeleteCredentialResponse, error) {
	uid, _, err := s.identity.Resolve(ctx, req.GetToken())
	if err != nil {
		return nil, mapErr(err)
	}
	if err := s.svc.Delete(ctx, uid, req.GetCredentialId()); err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.DeleteCredentialResponse{}, nil
}

func toProto(c domain.Credential) *passkeyv1.Credential {
	last := ""
	if c.LastUsedAt != nil {
		last = c.LastUsedAt.Format(time.RFC3339)
	}
	return &passkeyv1.Credential{
		Id:         base64.RawURLEncoding.EncodeToString(c.CredentialID),
		Name:       c.Name,
		CreatedAt:  c.CreatedAt.Format(time.RFC3339),
		LastUsedAt: last,
	}
}
