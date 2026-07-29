package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// resolveLabelsCap bounds one request, so this stays a labelling helper rather
// than a way to page out the catalog. It matches ResolveTerritorySlugs' cap:
// the caller is the same audit page.
const resolveLabelsCap = 500

// labelKinds is what this service can name. A kind outside it is dropped rather
// than refused: during a rolling deploy a newer gateway may ask for one, and
// refusing would cost the reader every other label on the page.
var labelKinds = map[string]struct{}{
	"territory": {},
	"model":     {},
	"panorama":  {},
}

// ResolveLabels names catalog rows for the audit journal.
//
// No scope, for the same reason ResolveTerritorySlugs has none: the caller
// arrives with ids taken from journal entries its own scope already let
// through, so a slug next to a visible id discloses nothing further. The cap
// stands in for the scope.
//
// A ref that matches nothing is absent from the result — the journal outlives
// the rows it describes, and the caller falls back to showing the id.
func (c *Catalog) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	if len(refs) > resolveLabelsCap {
		return nil, fmt.Errorf("catalog.ResolveLabels: %w: at most %d refs per call",
			domain.ErrInvalidInput, resolveLabelsCap)
	}

	byKind := make(map[string][]int64, len(labelKinds))
	seen := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		// Ноль означает «в снимке этого поля не было», а не строку каталога.
		if ref.ID <= 0 {
			continue
		}
		if _, ok := labelKinds[ref.Kind]; !ok {
			continue
		}
		key := ref.Kind + ":" + strconv.FormatInt(ref.ID, 10)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		byKind[ref.Kind] = append(byKind[ref.Kind], ref.ID)
	}
	if len(byKind) == 0 {
		return map[string]string{}, nil
	}
	return c.repo.ResolveLabels(ctx, byKind)
}
