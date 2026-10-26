package domain

// ModelTag is one entry of the fixed model tag list. Every model carries
// exactly one and a zone carries one to five; code refers to a tag by slug.
type ModelTag struct {
	Slug  string
	Title string
}
