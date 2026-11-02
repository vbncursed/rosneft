package service

import (
	"context"
	"slices"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModelTags returns the fixed tag list sorted by title, with the
// catch-all ungrouped tag last.
func (c *Catalog) ListModelTags(ctx context.Context) ([]domain.ModelTag, error) {
	tags, err := c.repo.ListModelTags(ctx)
	if err != nil {
		return nil, err
	}
	slices.SortFunc(tags, func(a, b domain.ModelTag) int {
		if au, bu := a.Slug == domain.UngroupedTagSlug, b.Slug == domain.UngroupedTagSlug; au != bu {
			if au {
				return 1
			}
			return -1
		}
		return strings.Compare(a.Title, b.Title)
	})
	return tags, nil
}
