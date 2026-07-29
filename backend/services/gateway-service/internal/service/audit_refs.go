package service

import (
	"context"
	"log/slog"
	"maps"
	"slices"
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Refs are routed to three resolvers, not two. Roles and permissions go to
// auth's ResolveLabels; users go to ResolveUserLogins, which already exists for
// the actor column and knows how to chunk; everything else refFields can
// produce is catalog's.
var (
	authLabelKinds = map[string]struct{}{"role": {}, "permission": {}}
	userKind       = "user"
)

// resolveRowRefs builds the page's label dictionary, keyed "field:value".
//
// Keyed by value rather than by field because a changed field needs a label for
// both sides of the arrow. The field name carries the kind, so the client needs
// no table of its own — see refFields.
//
// One call per service per page, never one per entry. The two run concurrently
// but not under an errgroup: that cancels its siblings on the first error, and
// here a failing auth must still leave catalog's labels standing. Each side
// logs and swallows its own failure — a journal that answers 500 because auth
// is restarting is worse than one that answers with uuids, which is exactly
// what it answered before this existed.
func (g *Gateway) resolveRowRefs(
	ctx context.Context, token string, entries []domain.AuditEntry,
) map[string]string {
	refs := collectRefs(entries)
	if len(refs) == 0 {
		return map[string]string{}
	}

	var (
		authRefs, catalogRefs []domain.LabelRef
		userIDs               []string
	)
	for _, r := range refs {
		switch {
		case r.Kind == userKind:
			userIDs = append(userIDs, r.ID)
		case hasKind(authLabelKinds, r.Kind):
			authRefs = append(authRefs, r)
		default:
			catalogRefs = append(catalogRefs, r)
		}
	}

	var (
		mu     sync.Mutex
		labels = make(map[string]string, len(refs))
		wg     sync.WaitGroup
	)
	collect := func(name string, call func() (map[string]string, error)) {
		wg.Go(func() {
			got, err := call()
			if err != nil {
				slog.WarnContext(ctx, "audit: could not resolve row refs", "resolver", name, "err", err)
				return
			}
			mu.Lock()
			defer mu.Unlock()
			maps.Copy(labels, got)
		})
	}
	if len(authRefs) > 0 {
		collect("auth", func() (map[string]string, error) {
			return chunkedLabels(authRefs, func(c []domain.LabelRef) (map[string]string, error) {
				return g.auth.ResolveLabels(ctx, token, c)
			})
		})
	}
	if len(catalogRefs) > 0 {
		collect("catalog", func() (map[string]string, error) {
			return chunkedLabels(catalogRefs, func(c []domain.LabelRef) (map[string]string, error) {
				return g.catalog.ResolveLabels(ctx, c)
			})
		})
	}
	if len(userIDs) > 0 {
		collect("auth-logins", func() (map[string]string, error) {
			return kindedLogins(g.resolveLoginsBatched(ctx, token, userIDs))
		})
	}
	wg.Wait()

	return keyByField(refs, labels)
}

// labelBatch is the largest ref list handed to one resolver in a single call.
// It must stay at or below the cap both ResolveLabels implementations enforce —
// they refuse an oversized request outright rather than truncating it.
//
// Chunked for the same reason resolveLoginsBatched is, and the reason is worth
// repeating because I got it wrong here once: that ceiling is a constant in
// another service's package, not a property of this code. A page is capped at
// 200 rows, but collectRefs reads both snapshots and placement's
// visible_panorama_ids is an array column with no bound anywhere, so "a page
// cannot overflow the cap" is not something this file may assume. Unchunked,
// one oversized page did not degrade — it lost every label from that resolver,
// silently, because collect() swallows the error.
const labelBatch = 500

func chunkedLabels(
	refs []domain.LabelRef, call func([]domain.LabelRef) (map[string]string, error),
) (map[string]string, error) {
	out := make(map[string]string, len(refs))
	for chunk := range slices.Chunk(refs, labelBatch) {
		got, err := call(chunk)
		if err != nil {
			return nil, err
		}
		maps.Copy(out, got)
	}
	return out, nil
}

func hasKind(set map[string]struct{}, kind string) bool {
	_, ok := set[kind]
	return ok
}

// kindedLogins re-keys ResolveUserLogins' bare-id map into the "<kind>:<id>"
// shape the other two resolvers already return, so the merge stays uniform.
func kindedLogins(logins map[string]string, err error) (map[string]string, error) {
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(logins))
	for id, login := range logins {
		out[userKind+":"+id] = login
	}
	return out, nil
}

// keyByField rewrites "<kind>:<id>" into "<field>:<id>" — the shape the client
// looks up.
//
// It walks the field table rather than the entries because one kind sits under
// more than one column name: a user is "user_id" in user_roles and
// "admin_user_id" in territory_assignments, and the client searches by the name
// it can see in the diff. Six entities against a page capped at 200 rows makes
// the sweep free.
//
// An id nobody resolved is left out entirely rather than mapped to an empty
// string: a blank label would paint over the id, and showing the id is the
// fallback.
func keyByField(refs []domain.LabelRef, labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels))
	for _, fields := range refFields {
		for field, kind := range fields {
			for _, r := range refs {
				if r.Kind != kind {
					continue
				}
				if label, ok := labels[kind+":"+r.ID]; ok {
					out[refKey(field, r.ID)] = label
				}
			}
		}
	}
	return out
}
