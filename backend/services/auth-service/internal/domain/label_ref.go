package domain

// LabelRef is one id the audit journal wants named, with the kind of row it
// points at. Roles and permissions are addressed by slug everywhere else in
// this service; the journal is the one caller that only has the uuid.
type LabelRef struct {
	Kind string
	ID   string
}
