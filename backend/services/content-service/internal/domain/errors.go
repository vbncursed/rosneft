package domain

import "errors"

// Sentinel errors propagated across layers. Storage returns these (possibly
// wrapped); service may also return ErrInvalidInput; transport maps each to
// the appropriate user-facing status code.
var (
	ErrTerritoryNotFound = errors.New("territory not found")
	ErrPanoramaNotFound  = errors.New("panorama not found")
	ErrDocumentNotFound  = errors.New("document not found")
	ErrInvalidInput      = errors.New("invalid input")
	// ErrImageTooLarge refuses a thumbnail source whose header claims more
	// pixels than a decode may allocate. It never reaches transport: a
	// panorama without a thumbnail is still created.
	ErrImageTooLarge = errors.New("image too large")
	// ErrSlugConflict means the proposed slug is already taken. The service
	// retries with the next numbered candidate; it never reaches transport.
	ErrSlugConflict = errors.New("slug already exists")
)
