package service

import (
	"errors"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/slug"
)

// maxSlugAttempts caps the numbered-suffix search so a pathological run of
// collisions can't loop forever. Reaching it is effectively impossible.
const maxSlugAttempts = 1000

// resolveSlug derives a base slug from title and persists the entity under
// the first free candidate (base, base-2, base-3, …). create receives each
// candidate slug and returns ErrSlugConflict when it's taken; any other
// error is returned as-is. The DB is the arbiter of uniqueness, so this is
// safe under concurrent creates.
func resolveSlug[T any](title, fallback string, create func(slug string) (T, error)) (T, error) {
	base := slug.Generate(title, fallback)
	for attempt := 1; attempt <= maxSlugAttempts; attempt++ {
		out, err := create(slug.Candidate(base, attempt))
		if err == nil {
			return out, nil
		}
		if !errors.Is(err, domain.ErrSlugConflict) {
			return out, err
		}
	}
	var zero T
	return zero, fmt.Errorf("resolveSlug: exhausted candidates for %q: %w", base, domain.ErrSlugConflict)
}
