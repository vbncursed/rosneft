package authhttp

import (
	"context"
	"slices"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// factors resolves both authentication factors for ids.
//
// A service that fails to answer yields a nil set — unknown, not off — and the
// request still succeeds. That split is deliberate: /api/auth/me is on the SPA
// boot path and may not fail, and an admin console that 503s because a factor
// service blinked is worse than one that shows "—" in two columns. What it must
// never do is print a status it did not verify.
//
// wantPasskeys is false for /api/auth/me: it runs on every page load and has no
// consumer for the passkey flag, so the round trip would buy nothing.
//
// The two lookups run in sequence, not in parallel. They are local gRPC calls
// on the same host; an errgroup here would add machinery for microseconds.
func (h *Handlers) factors(ctx context.Context, ids []string, wantPasskeys bool) (totp, passkeys factorSet) {
	if len(ids) == 0 {
		// No rows to render — "nobody" is a real answer, not an unknown one.
		return factorSet{}, factorSet{}
	}
	if on, err := chunked(ctx, ids, h.twofa.EnabledFor); err == nil {
		totp = on
	} else {
		// Warn, not Error: the request survives, but a silent "—" in the console
		// has to be diagnosable from the logs.
		h.logger.Warn("2fa status unavailable", "err", err, "users", len(ids))
	}
	if !wantPasskeys {
		return totp, nil
	}
	if on, err := chunked(ctx, ids, h.passkey.CredentialedUsers); err == nil {
		passkeys = on
	} else {
		h.logger.Warn("passkey status unavailable", "err", err, "users", len(ids))
	}
	return totp, passkeys
}

// factorBatch is the largest id list handed to one factor RPC in a single call.
//
// Neither twofa nor passkey caps its batch today, so nothing is broken without
// this — but that ceiling is a property of another service's package, not of
// this code, and `/api/auth/users` is not paginated, so the id count here is
// bounded by nothing but how many users a company has. This repo has already
// been burned once by exactly that assumption (see chunkedLabels in
// service/audit_refs.go, where an uncapped batch lost every label silently).
const factorBatch = 500

// chunked runs call over ids in factorBatch-sized pieces and unions the answers.
//
// A failing chunk fails the whole lookup rather than returning what the earlier
// chunks found. A partial set is worse than no set: absent ids read as "this
// user has the factor off", which is the false negative this whole change
// exists to eliminate. All-or-nothing keeps the nil/"unknown" contract honest.
func chunked(ctx context.Context, ids []string, call func(context.Context, []string) ([]string, error)) (factorSet, error) {
	out := make(factorSet, len(ids))
	for chunk := range slices.Chunk(ids, factorBatch) {
		got, err := call(ctx, chunk)
		if err != nil {
			return nil, err
		}
		for _, id := range got {
			out[id] = struct{}{}
		}
	}
	return out, nil
}

// userJSON and usersJSON are how every admin handler emits a user. They exist
// so that emitting one without resolving its factors is not something a handler
// can do by accident — the bare converters in dto.go demand the sets.
func (h *Handlers) userJSON(ctx context.Context, u *authv1.User) userJSON {
	totp, passkeys := h.factors(ctx, []string{u.GetId()}, true)
	return userToJSON(u, totp, passkeys)
}

func (h *Handlers) usersJSON(ctx context.Context, in []*authv1.User) []userJSON {
	ids := make([]string, 0, len(in))
	for _, u := range in {
		ids = append(ids, u.GetId())
	}
	totp, passkeys := h.factors(ctx, ids, true)
	return usersToJSON(in, totp, passkeys)
}
