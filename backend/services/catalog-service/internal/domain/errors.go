package domain

import "errors"

// Sentinel errors propagated across layers. Storage returns these (possibly
// wrapped); service may also return ErrInvalidInput; transport maps each to
// the appropriate user-facing status code.
var (
	ErrTerritoryNotFound = errors.New("territory not found")
	ErrModelNotFound     = errors.New("model not found")
	ErrArtifactNotFound  = errors.New("artifact not found")
	ErrPlacementNotFound = errors.New("placement not found")
	ErrPanoramaNotFound  = errors.New("panorama not found")
	ErrInvalidInput      = errors.New("invalid input")
	// ErrSlugConflict means the proposed slug is already taken. The service
	// retries with the next numbered candidate; it never reaches transport.
	ErrSlugConflict = errors.New("slug already exists")
)
