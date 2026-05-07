package httpapi

import (
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// codeOf returns a stable string code for a domain error so clients can
// branch on it without parsing free-form messages.
func codeOf(err error) string {
	switch {
	case errors.Is(err, domain.ErrSelfPlacement):
		return "self_placement"
	case errors.Is(err, domain.ErrInvalidInput):
		return "invalid_input"
	case errors.Is(err, domain.ErrProjectNotFound):
		return "project_not_found"
	case errors.Is(err, domain.ErrArtifactNotFound):
		return "artifact_not_found"
	case errors.Is(err, domain.ErrJobNotFound):
		return "job_not_found"
	case errors.Is(err, domain.ErrPlacementNotFound):
		return "placement_not_found"
	default:
		return "internal"
	}
}
