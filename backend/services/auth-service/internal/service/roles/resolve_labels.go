package roles

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// resolveLabelsCap bounds one request. Without it this call is a way to dump
// every role in the database one page at a time.
const resolveLabelsCap = 500

// labelKinds is what this service can name. A kind outside it is dropped rather
// than refused: during a rolling deploy a newer gateway may ask for one, and
// refusing would cost the reader every other label on the page.
var labelKinds = map[string]struct{}{
	"role":       {},
	"permission": {},
}

// ResolveLabels names roles and permissions for the audit journal.
//
// It applies no company scope, exactly as ResolveLogins does not: the ids come
// from entries the journal's own scope already let through, so a title next to
// a visible uuid discloses nothing new. They arrive from a row snapshot, never
// from a user-supplied parameter, so no one can fish for a stranger's uuid
// through this path. The size cap stands in for the scope.
//
// An id that matches nothing is absent from the result: the journal is
// append-only and remembers deleted roles, so the caller falls back to the uuid.
func (s *Service) ResolveLabels(ctx context.Context, refs []domain.LabelRef) (map[string]string, error) {
	if len(refs) == 0 {
		return map[string]string{}, nil
	}
	if len(refs) > resolveLabelsCap {
		return nil, fmt.Errorf("roles.ResolveLabels: %w: at most %d refs per call",
			domain.ErrInvalidInput, resolveLabelsCap)
	}

	byKind := make(map[string][]string, len(labelKinds))
	seen := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		if ref.ID == "" {
			continue
		}
		if _, ok := labelKinds[ref.Kind]; !ok {
			continue
		}
		// Отвергается здесь, а не в запросе. Запрос сравнивает id::text и мусор
		// переживёт — дело в ответе: невалидный id молча не совпал бы ни с чем и
		// прочитался бы как «роль удалена», а это другой факт.
		if uuid.Validate(ref.ID) != nil {
			return nil, fmt.Errorf("roles.ResolveLabels: %w: id must be a uuid",
				domain.ErrInvalidInput)
		}
		key := ref.Kind + ":" + ref.ID
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		byKind[ref.Kind] = append(byKind[ref.Kind], ref.ID)
	}
	if len(byKind) == 0 {
		return map[string]string{}, nil
	}
	return s.store.ResolveLabels(ctx, byKind)
}
