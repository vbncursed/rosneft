package domain

// LabelRef is one value from a row snapshot the journal wants named.
//
// ID is a string for both sides: catalog ids are numbers and auth ids are
// uuids, but the page dictionary is flat and keyed by the snapshot's own text,
// so converting once at the client edge is cheaper than carrying two shapes
// through the service layer.
type LabelRef struct {
	Kind string
	ID   string
}
