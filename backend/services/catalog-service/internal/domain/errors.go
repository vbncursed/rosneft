package domain

import (
	"errors"
	"fmt"
)

// Sentinel errors propagated across layers. Storage returns these (possibly
// wrapped); service may also return ErrInvalidInput; transport maps each to
// the appropriate user-facing status code.
var (
	ErrTerritoryNotFound = errors.New("territory not found")
	ErrModelNotFound     = errors.New("model not found")
	ErrArtifactNotFound  = errors.New("artifact not found")
	ErrPlacementNotFound = errors.New("placement not found")
	// ErrMeasurementNotFound also covers a measurement id that exists under
	// another territory: the caller only ever names the one in its URL.
	ErrMeasurementNotFound = errors.New("measurement not found")
	ErrInvalidInput        = errors.New("invalid input")
	// ErrSlugConflict means the proposed slug is already taken. For a derived
	// slug the service retries with the next numbered candidate; an explicit
	// slug has no candidate, so it reaches transport as AlreadyExists.
	ErrSlugConflict = errors.New("slug already exists")
)

// ItemError names the batch item a refusal is about. It unwraps to the
// sentinel, so transport maps it like a single refusal and adds the index.
type ItemError struct {
	Index int
	Err   error
}

func (e ItemError) Error() string { return fmt.Sprintf("item %d: %v", e.Index, e.Err) }

func (e ItemError) Unwrap() error { return e.Err }
