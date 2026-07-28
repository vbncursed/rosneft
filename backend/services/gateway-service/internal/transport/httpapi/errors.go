package httpapi

import (
	"errors"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// isInvalid reports whether the error should map to 400.
func isInvalid(err error) bool {
	return errors.Is(err, domain.ErrInvalidInput)
}

// isForbidden reports whether the error should map to 403.
func isForbidden(err error) bool {
	return errors.Is(err, domain.ErrForbidden)
}

// isNotFound reports whether the error should map to 404.
func isNotFound(err error) bool {
	return errors.Is(err, domain.ErrTerritoryNotFound) ||
		errors.Is(err, domain.ErrModelNotFound) ||
		errors.Is(err, domain.ErrArtifactNotFound) ||
		errors.Is(err, domain.ErrJobNotFound) ||
		errors.Is(err, domain.ErrPlacementNotFound) ||
		errors.Is(err, domain.ErrUploadNotFound)
}
