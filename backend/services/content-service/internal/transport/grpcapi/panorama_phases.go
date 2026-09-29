package grpcapi

import (
	"context"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
)

func (s *Server) SetPanoramasHidden(ctx context.Context, req *contentv1.SetPanoramasHiddenRequest) (*contentv1.SetPanoramasHiddenResponse, error) {
	n, err := s.svc.SetPanoramasHidden(ctx, req.GetTerritorySlug(), req.GetIds(), req.GetHidden())
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.SetPanoramasHiddenResponse{Updated: int32(n)}, nil
}

func (s *Server) SetPanoramasPhase(ctx context.Context, req *contentv1.SetPanoramasPhaseRequest) (*contentv1.SetPanoramasPhaseResponse, error) {
	n, err := s.svc.SetPanoramasPhase(ctx, req.GetTerritorySlug(), req.GetIds(), req.GetPhase())
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.SetPanoramasPhaseResponse{Updated: int32(n)}, nil
}

func (s *Server) SetPanoramaPhaseHidden(ctx context.Context, req *contentv1.SetPanoramaPhaseHiddenRequest) (*contentv1.SetPanoramaPhaseHiddenResponse, error) {
	v, err := s.svc.SetPanoramaPhaseHidden(ctx, req.GetTerritorySlug(), req.GetPhase(), req.GetHidden())
	if err != nil {
		return nil, mapError(err)
	}
	return &contentv1.SetPanoramaPhaseHiddenResponse{Phase: panoramaPhaseToProto(v)}, nil
}

func (s *Server) ListPanoramaPhases(ctx context.Context, req *contentv1.ListPanoramaPhasesRequest) (*contentv1.ListPanoramaPhasesResponse, error) {
	phases, err := s.svc.ListPanoramaPhases(ctx, req.GetTerritorySlug())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*contentv1.PanoramaPhase, len(phases))
	for i, v := range phases {
		out[i] = panoramaPhaseToProto(v)
	}
	return &contentv1.ListPanoramaPhasesResponse{Phases: out}, nil
}
