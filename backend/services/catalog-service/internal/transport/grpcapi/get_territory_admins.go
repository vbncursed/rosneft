package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) GetTerritoryAdmins(ctx context.Context, req *catalogv1.GetTerritoryAdminsRequest) (*catalogv1.GetTerritoryAdminsResponse, error) {
	ids, err := s.svc.GetTerritoryAdmins(ctx, req.GetSlug())
	if err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.GetTerritoryAdminsResponse{AdminUserIds: ids}, nil
}
