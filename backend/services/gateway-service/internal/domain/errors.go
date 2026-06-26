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
)
