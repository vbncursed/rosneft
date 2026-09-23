package service

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// validateArtifact rejects an artifact registration with empty slug or hash.
// Both are mandatory: slug ties the artifact to its owner; hash is the
// BlobStore key.
func validateArtifact(a domain.Artifact) error {
	if a.Slug == "" {
		return fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	}
	if a.Hash == "" {
		return fmt.Errorf("%w: empty hash", domain.ErrInvalidInput)
	}
	return nil
}

// validatePatch refuses what no partial edit may write: a row with no slug to
// address it by, or a title sent blank. A nil title is left alone.
func validatePatch(slug string, title *string) error {
	switch {
	case slug == "":
		return fmt.Errorf("%w: empty slug", domain.ErrInvalidInput)
	case title != nil && strings.TrimSpace(*title) == "":
		return fmt.Errorf("%w: empty title", domain.ErrInvalidInput)
	}
	return nil
}

// maxMeasurementPoints caps one chain. The viewer never draws anything close;
// the cap only keeps a hostile body from filling a row.
const maxMeasurementPoints = 1000

// validateMeasurement enforces what the measurements_points_shape constraint
// cannot say (the cap, finite values) and what it can, so a bad chain is a
// clear 400 before it reaches the database.
func validateMeasurement(m domain.Measurement) error {
	minPoints := 2
	if m.Closed {
		minPoints = 3
	}
	switch {
	case m.TerritorySlug == "":
		return fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	case len(m.Points) < minPoints:
		return fmt.Errorf("%w: a chain needs at least %d points, got %d", domain.ErrInvalidInput, minPoints, len(m.Points))
	case len(m.Points) > maxMeasurementPoints:
		return fmt.Errorf("%w: a chain holds at most %d points, got %d", domain.ErrInvalidInput, maxMeasurementPoints, len(m.Points))
	}
	for i, p := range m.Points {
		if !isFinite(p.X) || !isFinite(p.Y) || !isFinite(p.Z) {
			return fmt.Errorf("%w: point %d is not finite", domain.ErrInvalidInput, i)
		}
	}
	return nil
}

func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// maxBulkPlacementIDs bounds one bulk write: the ids as sent, before
// de-duplication, as the gateway's OpenAPI states it.
const maxBulkPlacementIDs = 1000

// distinctPlacementIDs refuses an empty slug or an empty or oversized list and
// answers each id once: storage counts the rows it updated against this
// length, so a repeated id would read as a missing one.
func distinctPlacementIDs(territorySlug string, ids []int64) ([]int64, error) {
	switch {
	case territorySlug == "":
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	case len(ids) == 0 || len(ids) > maxBulkPlacementIDs:
		return nil, fmt.Errorf("%w: a bulk update names 1 to %d placements, got %d",
			domain.ErrInvalidInput, maxBulkPlacementIDs, len(ids))
	}
	return slices.Compact(slices.Sorted(slices.Values(ids))), nil
}

// maxGroupTitle is placement_groups_title_len's upper bound, in characters.
const maxGroupTitle = 120

// groupTitle trims title and refuses it unless 1 to 120 characters remain: the
// placement_groups_title_len check, said as a 400 before the database says it.
func groupTitle(title string) (string, error) {
	t := strings.TrimSpace(title)
	if n := utf8.RuneCountInString(t); n == 0 || n > maxGroupTitle {
		return "", fmt.Errorf("%w: a group title is 1 to %d characters, got %d",
			domain.ErrInvalidInput, maxGroupTitle, n)
	}
	return t, nil
}
