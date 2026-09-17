package domain

import (
	"fmt"
	"time"
)

// Measurement is a saved ruler chain on a territory: points in the territory's
// normalised scene space, the same space placement positions live in, so a
// source replace rescales both together. Closed means the chain returns from
// its last point to its first.
type Measurement struct {
	ID            int64
	TerritorySlug string
	Points        []Vec3
	Closed        bool
	// CreatedBy is the user id of whoever saved the chain, empty when the
	// write carried no actor. Kept for the audit trail only.
	CreatedBy string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// FlattenPoints lays points out as x0,y0,z0,x1,… — the shape both the
// measurements.points column and the proto field use.
func FlattenPoints(points []Vec3) []float64 {
	flat := make([]float64, 0, len(points)*3)
	for _, p := range points {
		flat = append(flat, p.X, p.Y, p.Z)
	}
	return flat
}

// PointsFromFlat is FlattenPoints' inverse. A length that is not a multiple of
// three is ErrInvalidInput: the trailing coordinates belong to no point.
func PointsFromFlat(flat []float64) ([]Vec3, error) {
	if len(flat)%3 != 0 {
		return nil, fmt.Errorf("%w: %d coordinates is not a whole number of points", ErrInvalidInput, len(flat))
	}
	points := make([]Vec3, 0, len(flat)/3)
	for i := 0; i < len(flat); i += 3 {
		points = append(points, Vec3{X: flat[i], Y: flat[i+1], Z: flat[i+2]})
	}
	return points, nil
}
