package users

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// resolveCap bounds one request. Without it this call is a way to dump every
// login in the database one page at a time.
const resolveCap = 500

// ResolveLogins maps user ids to logins for an internal caller.
//
// It deliberately applies no created_by scope, unlike Get and List. Those pin
// the result to users the actor created — a rule that does not line up with the
// audit journal's own scope, and that mismatch is what made a user's own
// actions show up under a raw uuid. The ids handed in here are ones the caller
// already sees in entries the journal's scope let through, so putting a login
// next to a visible uuid discloses nothing new. The size cap stands in for the
// scope: it keeps the call a labelling helper rather than an export.
//
// An id that matches nothing is simply absent from the result. The journal is
// append-only and remembers deleted users, so a missing login is an ordinary
// outcome and the caller falls back to showing the uuid.
func (s *Service) ResolveLogins(ctx context.Context, ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	if len(ids) > resolveCap {
		return nil, fmt.Errorf("users.ResolveLogins: %w: at most %d ids per call",
			domain.ErrInvalidInput, resolveCap)
	}
	uniq := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		// A system change carries no actor; that empty string is not a user and
		// has no business reaching the query.
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		// Rejected here rather than left to the query. The storage layer compares
		// id::text precisely so a malformed value cannot reach a uuid cast, so
		// this is not about avoiding SQLSTATE 22P02 — that hazard is engineered
		// away one file over. It is about the answer: an unvalidated id would
		// silently match nothing and read as "user deleted", which is a
		// different fact from "you sent nonsense".
		if uuid.Validate(id) != nil {
			return nil, fmt.Errorf("users.ResolveLogins: %w: id must be a uuid",
				domain.ErrInvalidInput)
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return map[string]string{}, nil
	}
	return s.store.ResolveLogins(ctx, uniq)
}
