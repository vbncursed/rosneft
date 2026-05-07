package grpcapi

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) RegisterArtifact(ctx context.Context, req *catalogv1.RegisterArtifactRequest) (*catalogv1.RegisterArtifactResponse, error) {
	in := req.GetArtifact()
	if in == nil {
		return nil, status.Error(codes.InvalidArgument, "artifact is required")
	}
	out, err := s.svc.RegisterArtifact(ctx, artifactFromProto(in))
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.RegisterArtifactResponse{Artifact: artifactToProto(out)}, nil
}
