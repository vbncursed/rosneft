package domain

import "errors"

// Sentinel errors. Lower layers return these (possibly wrapped); the service
// layer adds ErrInvalidInput; transport maps each to user-facing codes.
var (
	ErrJobNotFound      = errors.New("job not found")
	ErrProjectNotFound  = errors.New("project not found")
	ErrArtifactNotFound = errors.New("artifact not found")
	ErrInvalidInput     = errors.New("invalid input")
)
