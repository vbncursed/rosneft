package domain

import "errors"

// Sentinel errors. Clients map remote gRPC NotFound codes to these; service
// adds ErrInvalidInput; transport maps each to user-facing HTTP status.
var (
	ErrTerritoryNotFound = errors.New("territory not found")
	ErrModelNotFound     = errors.New("model not found")
	ErrArtifactNotFound  = errors.New("artifact not found")
	ErrJobNotFound       = errors.New("job not found")
	ErrPlacementNotFound = errors.New("placement not found")
	ErrPanoramaNotFound  = errors.New("panorama not found")
	ErrDocumentNotFound  = errors.New("document not found")
	ErrUploadNotFound    = errors.New("upload session not found")
	ErrInvalidInput      = errors.New("invalid input")
	// ErrForbidden marks a caller who is authenticated but not entitled to the
	// resource — distinct from a missing permission, which the route middleware
	// rejects before the service is reached.
	ErrForbidden = errors.New("forbidden")
	// ErrMeasurementNotFound also covers an id that exists under another
	// territory: the catalog scopes every id-addressed call by slug.
	ErrMeasurementNotFound = errors.New("measurement not found")
	// ErrIdempotencyConflict is a batch create whose Idempotency-Key already
	// names a stored batch of another size on the territory — a 409.
	ErrIdempotencyConflict = errors.New("idempotency key reused with a different batch")
)
