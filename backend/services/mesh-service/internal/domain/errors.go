package domain

import "errors"

// Sentinel errors. Lower layers return these (possibly wrapped); the service
// layer adds ErrInvalidInput; transport maps each to user-facing codes.
// ErrBadSource marks a conversion failure caused by the content of the uploaded
// source (corrupt or hostile archive, unparseable mesh): retrying the same
// bytes fails the same way, which is what the reconciler keys on.
var (
	ErrJobNotFound      = errors.New("job not found")
	ErrTargetNotFound   = errors.New("conversion target not found")
	ErrArtifactNotFound = errors.New("artifact not found")
	ErrInvalidInput     = errors.New("invalid input")
	ErrBadSource        = errors.New("bad source")
)
