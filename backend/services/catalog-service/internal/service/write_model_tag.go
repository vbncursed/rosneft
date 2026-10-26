package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// maxTagTitle matches model_tags' title CHECK, in characters.
const maxTagTitle = 120

// tagSlugPattern is 2–40 lowercase letters, digits and single hyphens, never
// at either end. Stricter than the table's CHECK, which only guards the shape.
var tagSlugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const (
	minTagSlug = 2
	maxTagSlug = 40
)

// CreateModelTag adds a tag under the trimmed title.
func (c *Catalog) CreateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	if n := len(slug); n < minTagSlug || n > maxTagSlug || !tagSlugPattern.MatchString(slug) {
		return domain.ModelTag{}, fmt.Errorf("service.CreateModelTag: %w: a tag slug is %d to %d lowercase letters, digits and single hyphens",
			domain.ErrInvalidInput, minTagSlug, maxTagSlug)
	}
	if err := refuseUngrouped(slug); err != nil {
		return domain.ModelTag{}, fmt.Errorf("service.CreateModelTag: %w", err)
	}
	title, err := tagTitle(title)
	if err != nil {
		return domain.ModelTag{}, fmt.Errorf("service.CreateModelTag: %w", err)
	}
	return c.repo.CreateModelTag(ctx, slug, title)
}

// UpdateModelTag retitles a tag; its slug is permanent and ungrouped is fixed.
func (c *Catalog) UpdateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	if slug == "" {
		return domain.ModelTag{}, fmt.Errorf("service.UpdateModelTag: %w: empty tag slug", domain.ErrInvalidInput)
	}
	if err := refuseUngrouped(slug); err != nil {
		return domain.ModelTag{}, fmt.Errorf("service.UpdateModelTag: %w", err)
	}
	title, err := tagTitle(title)
	if err != nil {
		return domain.ModelTag{}, fmt.Errorf("service.UpdateModelTag: %w", err)
	}
	return c.repo.UpdateModelTag(ctx, slug, title)
}

func refuseUngrouped(slug string) error {
	if slug == domain.UngroupedTagSlug {
		return fmt.Errorf("%w: the ungrouped tag cannot be changed", domain.ErrInvalidInput)
	}
	return nil
}

func tagTitle(title string) (string, error) {
	t := strings.TrimSpace(title)
	if n := utf8.RuneCountInString(t); n == 0 || n > maxTagTitle {
		return "", fmt.Errorf("%w: a tag title is 1 to %d characters, got %d", domain.ErrInvalidInput, maxTagTitle, n)
	}
	return t, nil
}
