package domain

import "time"

// PlacementGroup is a user-made group of placements on a territory. A
// placement is in at most one; deleting the group returns its placements to
// no group. Hidden is the group's own shared flag: a placement is drawn only
// when neither it nor its group is hidden.
type PlacementGroup struct {
	ID            int64
	TerritorySlug string
	Title         string
	Hidden        bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
