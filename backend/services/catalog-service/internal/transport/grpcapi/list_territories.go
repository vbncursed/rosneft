package grpcapi

import (
	"context"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

func (s *Server) ListTerritories(ctx context.Context, _ *catalogv1.ListTerritoriesRequest) (*catalogv1.ListTerritoriesResponse, error) {
	out, err := s.svc.ListTerritories(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	resp := &catalogv1.ListTerritoriesResponse{Territories: make([]*catalogv1.Territory, 0, len(out))}
	for _, t := range out {
		resp.Territories = append(resp.Territories, territoryToProto(t))
	}
	return resp, nil
}
