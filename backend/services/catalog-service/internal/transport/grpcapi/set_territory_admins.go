package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) SetTerritoryAdmins(ctx context.Context, req *catalogv1.SetTerritoryAdminsRequest) (*catalogv1.SetTerritoryAdminsResponse, error) {
	if err := s.svc.SetTerritoryAdmins(ctx, req.GetSlug(), req.GetAdminUserIds()); err != nil {
		return nil, mapError(err)
	}
	return &catalogv1.SetTerritoryAdminsResponse{}, nil
}
