package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) CreateModelTag(ctx context.Context, req *catalogv1.CreateModelTagRequest) (*catalogv1.CreateModelTagResponse, error) {
	tag, err := s.svc.CreateModelTag(ctx, req.GetSlug(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.CreateModelTagResponse{Tag: modelTagToProto(tag)}, nil
}

func (s *Server) UpdateModelTag(ctx context.Context, req *catalogv1.UpdateModelTagRequest) (*catalogv1.UpdateModelTagResponse, error) {
	tag, err := s.svc.UpdateModelTag(ctx, req.GetSlug(), req.GetTitle())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.UpdateModelTagResponse{Tag: modelTagToProto(tag)}, nil
}
