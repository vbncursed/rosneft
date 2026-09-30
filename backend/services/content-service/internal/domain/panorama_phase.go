package domain

import (
	"fmt"
	"slices"
)

// PanoramaPhase is the stage of the job a panorama was taken at. The set is
// fixed (no custom or renamed phases); the panoramas_phase_valid check says
// the same in the database.
type PanoramaPhase string

const (
	PhasePrior   PanoramaPhase = "prior"
	PhaseCurrent PanoramaPhase = "current"
	PhasePost    PanoramaPhase = "post"
)

// PanoramaPhases is every phase in display order: prior, current, post.
var PanoramaPhases = []PanoramaPhase{PhasePrior, PhaseCurrent, PhasePost}

// ParsePanoramaPhase answers s as a phase, or ErrInvalidInput when it names
// none of the three. The match is exact: "" and "Prior" are refused.
func ParsePanoramaPhase(s string) (PanoramaPhase, error) {
	p := PanoramaPhase(s)
	if !slices.Contains(PanoramaPhases, p) {
		return "", fmt.Errorf("%w: unknown panorama phase %q", ErrInvalidInput, s)
	}
	return p, nil
}

// PanoramaPhaseVisibility is one phase's shared hidden flag on a territory. A
// panorama is drawn only when neither it nor its phase is hidden; a phase with
// no stored row is shown.
type PanoramaPhaseVisibility struct {
	Phase  PanoramaPhase
	Hidden bool
}
