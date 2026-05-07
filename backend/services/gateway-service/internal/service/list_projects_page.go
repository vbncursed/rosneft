package service

import (
	"context"
	"fmt"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// maxProjectPageLimit caps requested page size — protects the gateway from
// degenerate clients asking for huge pages, even though the underlying
// catalog always returns the full list today.
const maxProjectPageLimit = 1000

// ListProjectsPage returns one page of catalog projects sorted by slug.
//
// Pagination semantics today are gateway-side: catalog returns the full
// list, gateway slices it. This is a known scaling concern (cost is O(N)
// per request regardless of page size) but holds while the catalog has at
// most a few hundred entries. The wire contract lets us swap to DB-side
// pagination later without touching frontends.
//
// Limit 0 means "no pagination" — all items are returned and NextCursor
// is empty. Cursor is the slug of the last item from the previous page;
// items with slug <= cursor are skipped.
func (g *Gateway) ListProjectsPage(ctx context.Context, limit int32, cursor string) (domain.ProjectPage, error) {
	if limit < 0 {
		return domain.ProjectPage{}, fmt.Errorf("%w: limit must be non-negative", domain.ErrInvalidInput)
	}
	if limit > maxProjectPageLimit {
		return domain.ProjectPage{}, fmt.Errorf("%w: limit exceeds %d", domain.ErrInvalidInput, maxProjectPageLimit)
	}

	all, err := g.catalog.ListProjects(ctx)
	if err != nil {
		return domain.ProjectPage{}, err
	}
	slices.SortFunc(all, func(a, b domain.Project) int {
		switch {
		case a.Slug < b.Slug:
			return -1
		case a.Slug > b.Slug:
			return 1
		default:
			return 0
		}
	})

	if cursor != "" {
		idx, _ := slices.BinarySearchFunc(all, cursor, func(p domain.Project, c string) int {
			switch {
			case p.Slug <= c:
				return -1
			default:
				return 1
			}
		})
		all = all[idx:]
	}

	if limit == 0 || int(limit) >= len(all) {
		return domain.ProjectPage{Items: all}, nil
	}
	page := all[:limit]
	return domain.ProjectPage{
		Items:      page,
		NextCursor: page[len(page)-1].Slug,
	}, nil
}
