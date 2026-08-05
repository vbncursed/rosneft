package authhttp

import (
	"context"

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
	if on, err := h.twofa.EnabledFor(ctx, ids); err == nil {
		totp = newFactorSet(on)
	} else {
		// Warn, not Error: the request survives, but a silent "—" in the console
		// has to be diagnosable from the logs.
		h.logger.Warn("2fa status unavailable", "err", err, "users", len(ids))
	}
	if !wantPasskeys {
		return totp, nil
	}
	if on, err := h.passkey.CredentialedUsers(ctx, ids); err == nil {
		passkeys = newFactorSet(on)
	} else {
		h.logger.Warn("passkey status unavailable", "err", err, "users", len(ids))
	}
	return totp, passkeys
}

func newFactorSet(ids []string) factorSet {
	f := make(factorSet, len(ids))
	for _, id := range ids {
		f[id] = struct{}{}
	}
	return f
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
