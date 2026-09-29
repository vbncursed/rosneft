package domain

import "time"

// PlacementGroup is a user-made group of placements on one territory. A
// placement sits in at most one; deleting the group returns its placements to
// no group (the FK's ON DELETE SET NULL) and never deletes them. Hidden is the
// group's own shared flag: a member is drawn only when neither it nor its
// group is hidden, and hiding the group never writes the members.
type PlacementGroup struct {
	ID            int64
	TerritorySlug string
	Title         string
	Hidden        bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
