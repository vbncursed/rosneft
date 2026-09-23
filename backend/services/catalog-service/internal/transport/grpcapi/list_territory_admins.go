package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListTerritoryAdmins(ctx context.Context, req *catalogv1.ListTerritoryAdminsRequest) (*catalogv1.ListTerritoryAdminsResponse, error) {
	bySlug, err := s.svc.ListTerritoryAdmins(ctx, req.GetSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListTerritoryAdminsResponse{}
	for slug, ids := range bySlug {
		for _, id := range ids {
			resp.Admins = append(resp.Admins, &catalogv1.TerritoryAdmin{TerritorySlug: slug, AdminUserId: id})
		}
	}
	return resp, nil
}
