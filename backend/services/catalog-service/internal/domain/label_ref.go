package domain

// LabelRef is one id the audit journal wants named, together with the kind of
// row it points at. The kind is part of the request because a bare number is
// ambiguous: model 7 and panorama 7 are different rows.
type LabelRef struct {
	Kind string
	ID   int64
}
