package service

import (
	"fmt"
	"slices"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// maxBulkPanoramaIDs bounds one bulk write: the ids as sent, before
// de-duplication, as the gateway's OpenAPI states it.
const maxBulkPanoramaIDs = 1000

// distinctPanoramaIDs refuses an empty slug or an empty or oversized list and
// answers each id once: storage counts the rows it updated against this
// length, so a repeated id would read as a missing one.
func distinctPanoramaIDs(territorySlug string, ids []int64) ([]int64, error) {
	switch {
	case territorySlug == "":
		return nil, fmt.Errorf("%w: empty territory slug", domain.ErrInvalidInput)
	case len(ids) == 0 || len(ids) > maxBulkPanoramaIDs:
		return nil, fmt.Errorf("%w: a bulk update names 1 to %d panoramas, got %d",
			domain.ErrInvalidInput, maxBulkPanoramaIDs, len(ids))
	}
	return slices.Compact(slices.Sorted(slices.Values(ids))), nil
}
