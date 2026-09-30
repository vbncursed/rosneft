package content

import (
	"context"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// SetPanoramasHidden hides or shows every panorama in ids on territorySlug,
// all or none, and answers how many were written.
func (c *Client) SetPanoramasHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	resp, err := c.cc.SetPanoramasHidden(ctx, &contentv1.SetPanoramasHiddenRequest{
		TerritorySlug: territorySlug, Ids: ids, Hidden: hidden,
	})
	if err != nil {
		return 0, grpcerr.Refused("content.SetPanoramasHidden", err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)
	}
	return int(resp.GetUpdated()), nil
}

// SetPanoramasPhase moves every panorama in ids on territorySlug into phase,
// all or none, and answers how many were written.
func (c *Client) SetPanoramasPhase(ctx context.Context, territorySlug string, ids []int64, phase string) (int, error) {
	resp, err := c.cc.SetPanoramasPhase(ctx, &contentv1.SetPanoramasPhaseRequest{
		TerritorySlug: territorySlug, Ids: ids, Phase: phase,
	})
	if err != nil {
		return 0, grpcerr.Refused("content.SetPanoramasPhase", err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)
	}
	return int(resp.GetUpdated()), nil
}

// SetPanoramaPhaseHidden sets one phase's shared hidden flag on territorySlug.
func (c *Client) SetPanoramaPhaseHidden(ctx context.Context, territorySlug, phase string, hidden bool) (domain.PanoramaPhase, error) {
	resp, err := c.cc.SetPanoramaPhaseHidden(ctx, &contentv1.SetPanoramaPhaseHiddenRequest{
		TerritorySlug: territorySlug, Phase: phase, Hidden: hidden,
	})
	if err != nil {
		return domain.PanoramaPhase{}, grpcerr.Refused("content.SetPanoramaPhaseHidden", err, domain.ErrPanoramaNotFound, domain.ErrTerritoryNotFound)
	}
	return panoramaPhaseFromProto(resp.GetPhase()), nil
}

// ListPanoramaPhases returns the territory's phase flags, for the scene bundle.
// A content-service without the RPC (the gateway deployed ahead of it, or
// content rolled back) answers Unimplemented, which is no rows: every phase
// shown, and the scene still loads.
func (c *Client) ListPanoramaPhases(ctx context.Context, territorySlug string) ([]domain.PanoramaPhase, error) {
	resp, err := c.cc.ListPanoramaPhases(ctx, &contentv1.ListPanoramaPhasesRequest{TerritorySlug: territorySlug})
	if status.Code(err) == codes.Unimplemented {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("content.ListPanoramaPhases: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.PanoramaPhase, len(resp.GetPhases()))
	for i, p := range resp.GetPhases() {
		out[i] = panoramaPhaseFromProto(p)
	}
	return out, nil
}

func panoramaPhaseFromProto(p *contentv1.PanoramaPhase) domain.PanoramaPhase {
	return domain.PanoramaPhase{Phase: p.GetPhase(), Hidden: p.GetHidden()}
}
