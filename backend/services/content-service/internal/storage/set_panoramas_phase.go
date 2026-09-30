package storage

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// setPanoramasPhaseQuery is updatePanoramas' statement for the phase column.
const setPanoramasPhaseQuery = `
	UPDATE panoramas pa SET phase = $3, updated_at = NOW()
	FROM territories t
	WHERE pa.territory_id = t.id AND t.slug = $1 AND pa.id = ANY($2)`

// SetPanoramasPhase moves every panorama in ids on territorySlug into phase,
// all or none, and answers how many it wrote. A panorama moved into a hidden
// phase is hidden by it; its own flag is left alone.
func (r *PG) SetPanoramasPhase(ctx context.Context, territorySlug string, ids []int64, phase domain.PanoramaPhase) (int, error) {
	return r.updatePanoramas(ctx, "storage.SetPanoramasPhase", setPanoramasPhaseQuery, territorySlug, ids, string(phase))
}
