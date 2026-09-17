package service

import (
	"fmt"
	"math"

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
