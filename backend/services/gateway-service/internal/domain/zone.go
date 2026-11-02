package domain

import "time"

// Zone is a named rectangle on a territory, in the territory's normalised scene
// space (the space measurements use), with one to five tags.
type Zone struct {
	ID      int64
	Title   string
	Corners []Vec3
	Tags    []ModelTag
	// DrawingWidthM and DrawingHeightM are nil when the drawing's scale is unknown.
	DrawingWidthM  *float64
	DrawingHeightM *float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// ZoneCreate is the body of a new zone; its tags are named by slug.
type ZoneCreate struct {
	Title          string
	Corners        []Vec3
	TagSlugs       []string
	DrawingWidthM  *float64
	DrawingHeightM *float64
}

// ZonePatch edits a zone's title and tags. A nil Title keeps the stored one;
// TagSlugs replace the tags only when SetTags is true, since an empty slice
// cannot say "absent".
type ZonePatch struct {
	Title    *string
	TagSlugs []string
	SetTags  bool
}
