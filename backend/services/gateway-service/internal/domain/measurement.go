package domain

import "time"

// Measurement is a saved ruler chain on a territory. Points are in the
// territory's normalised scene space — the space placement positions use — in
// drawing order; a closed chain has an implicit segment back to its first point.
type Measurement struct {
	ID            int64
	TerritorySlug string
	Points        []Vec3
	Closed        bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
