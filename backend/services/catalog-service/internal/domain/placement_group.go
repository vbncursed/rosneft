package domain

import "time"

// PlacementGroup is a user-made group of placements on one territory. A
// placement sits in at most one; deleting the group returns its placements to
// no group (the FK's ON DELETE SET NULL) and never deletes them.
type PlacementGroup struct {
	ID            int64
	TerritorySlug string
	Title         string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
