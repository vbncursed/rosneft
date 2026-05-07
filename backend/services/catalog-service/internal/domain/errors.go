package domain

import "errors"

// Sentinel errors propagated across layers. Storage returns these (possibly
// wrapped); service may also return ErrInvalidInput; transport maps each to
// the appropriate user-facing status code.
var (
	ErrProjectNotFound   = errors.New("project not found")
	ErrArtifactNotFound  = errors.New("artifact not found")
	ErrPlacementNotFound = errors.New("placement not found")
	ErrSelfPlacement     = errors.New("cannot place a project onto itself")
	ErrInvalidInput      = errors.New("invalid input")
)
