package domain

import "time"

// PlacementGroup is a user-made group of placements on a territory. A
// placement is in at most one; deleting the group returns its placements to
// no group.
type PlacementGroup struct {
	ID            int64
	TerritorySlug string
	Title         string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
