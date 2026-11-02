package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListModelTags(
	ctx context.Context,
	_ *catalogv1.ListModelTagsRequest,
) (*catalogv1.ListModelTagsResponse, error) {
	tags, err := s.svc.ListModelTags(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*catalogv1.ModelTag, len(tags))
	for i, t := range tags {
		out[i] = modelTagToProto(t)
	}
	return &catalogv1.ListModelTagsResponse{Tags: out}, nil
}
