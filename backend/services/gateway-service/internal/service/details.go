package service

import (
	"fmt"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// The title and description rules the create and PATCH paths of territories
// and models share. The catalog stores what it is sent, so padding is cut
// here, and a title that is nothing but padding is refused on both paths.

// trimDetails trims a PATCH's title and description; nil stays nil (leave the
// field alone), and a description of spaces becomes "" (clear it). It then
// refuses a title the PATCH sends blank, before any catalog call, so a refusal
// costs no round trip. Last writer wins — no If-Match, by decision.
func trimDetails(title, description *string) (*string, *string, error) {
	title, description = trimmed(title), trimmed(description)
	if title != nil && *title == "" {
		return nil, nil, fmt.Errorf("%w: empty title", domain.ErrInvalidInput)
	}
	return title, description, nil
}

func trimmed(s *string) *string {
	if s == nil {
		return nil
	}
	return new(strings.TrimSpace(*s))
}

// validateEntity rejects EntityCreate-style inputs missing required fields,
// a whitespace-only title included: the catalog derives the slug from it.
// Only title and source hash are required — the slug is not user-supplied.
func validateEntity(title, hash string) error {
	switch {
	case strings.TrimSpace(title) == "":
		return fmt.Errorf("%w: empty title", domain.ErrInvalidInput)
	case hash == "":
		return fmt.Errorf("%w: empty source_blob_hash", domain.ErrInvalidInput)
	}
	return nil
}
