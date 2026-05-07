package domain

import "errors"

// Sentinel errors. Clients map remote gRPC NotFound codes to these; service
// adds ErrInvalidInput; transport maps each to user-facing HTTP status.
var (
	ErrProjectNotFound   = errors.New("project not found")
	ErrArtifactNotFound  = errors.New("artifact not found")
	ErrJobNotFound       = errors.New("job not found")
	ErrPlacementNotFound = errors.New("placement not found")
	ErrSelfPlacement     = errors.New("cannot place a project onto itself")
	ErrInvalidInput      = errors.New("invalid input")
)
