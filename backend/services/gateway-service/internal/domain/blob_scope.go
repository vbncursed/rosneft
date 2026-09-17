package domain

// BlobScope is whose blobs a caller may attach to a row by hash: Root
// (AllAccess) any, everyone else those they uploaded or can already read
// within AdminID's territories.
type BlobScope struct {
	AdminID   string
	AllAccess bool
}
