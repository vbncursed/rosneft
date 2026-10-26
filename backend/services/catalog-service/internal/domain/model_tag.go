package domain

// UngroupedTagSlug is the catch-all tag every pre-tag model was migrated to.
// A zone may not carry it.
const UngroupedTagSlug = "ungrouped"

// ModelTag is one entry of the fixed model tag list. Code refers to a tag by
// slug; the id never leaves the catalog.
type ModelTag struct {
	ID    int64
	Slug  string
	Title string
}
