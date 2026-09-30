package service

import (
	"context"
	"fmt"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// checkPhase refuses anything but the three phases, exactly as spelled: the
// path parameter and the body field are free strings on the wire, and content
// would refuse them anyway, one round trip later.
func checkPhase(phase string) error {
	if !slices.Contains(domain.PanoramaPhases, phase) {
		return fmt.Errorf("%w: a panorama phase is prior, current or post, got %q", domain.ErrInvalidInput, phase)
	}
	return nil
}

// SetPanoramasHidden hides or shows every panorama in ids on territorySlug,
// all or none, and answers how many were written. Content scopes every id by
// territorySlug, the slug the route's gate checked.
func (g *Gateway) SetPanoramasHidden(ctx context.Context, territorySlug string, ids []int64, hidden bool) (int, error) {
	if err := checkBulkIDs(ids, "panoramas"); err != nil {
		return 0, err
	}
	return g.content.SetPanoramasHidden(ctx, territorySlug, ids, hidden)
}

// SetPanoramasPhase moves every panorama in ids on territorySlug into phase,
// all or none.
func (g *Gateway) SetPanoramasPhase(ctx context.Context, territorySlug string, ids []int64, phase string) (int, error) {
	if err := checkBulkIDs(ids, "panoramas"); err != nil {
		return 0, err
	}
	if err := checkPhase(phase); err != nil {
		return 0, err
	}
	return g.content.SetPanoramasPhase(ctx, territorySlug, ids, phase)
}

// SetPanoramaPhaseHidden sets one phase's shared hidden flag on territorySlug.
// The panoramas' own flags are untouched (spec D5).
func (g *Gateway) SetPanoramaPhaseHidden(ctx context.Context, territorySlug, phase string, hidden bool) (domain.PanoramaPhase, error) {
	if err := checkPhase(phase); err != nil {
		return domain.PanoramaPhase{}, err
	}
	return g.content.SetPanoramaPhaseHidden(ctx, territorySlug, phase, hidden)
}
