package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// resolveSlugsCap bounds one request, so this stays a labelling helper rather
// than a way to page out the whole territory table.
const resolveSlugsCap = 500

// ResolveTerritorySlugs maps territory ids to slugs.
//
// It exists for the audit journal, which knows a placement's, panorama's or
// document's parent only as the number inside its row snapshot — the public
// Territory message carries a slug and no id, and adding one there would change
// a shape the whole scene reads for the sake of an internal lookup.
//
// No scope: a caller reaches this only with ids taken from journal entries their
// own scope already let through. An id that matches nothing is absent from the
// result — the journal outlives the territories it describes.
func (c *Catalog) ResolveTerritorySlugs(ctx context.Context, ids []int64) (map[int64]string, error) {
	if len(ids) == 0 {
		return map[int64]string{}, nil
	}
	if len(ids) > resolveSlugsCap {
		return nil, fmt.Errorf("catalog.ResolveTerritorySlugs: %w: at most %d ids per call",
			domain.ErrInvalidInput, resolveSlugsCap)
	}
	uniq := make([]int64, 0, len(ids))
	seen := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		// Ноль означает «в снимке этого поля не было», а не территорию.
		if id <= 0 {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return map[int64]string{}, nil
	}
	return c.repo.ResolveTerritorySlugs(ctx, uniq)
}
