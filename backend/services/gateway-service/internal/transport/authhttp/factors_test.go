package authhttp

import (
	"io"
	"log/slog"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// deadFactorHandlers points both factor clients at a port nothing listens on.
// Dial is lazy (grpc.NewClient), so construction succeeds and the RPC fails at
// call time — the exact failure this needs, with no interface added for a test.
func deadFactorHandlers(t *testing.T) *Handlers {
	t.Helper()
	tf, err := twofa.Dial("127.0.0.1:1")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = tf.Close() })
	pk, err := passkey.Dial("127.0.0.1:1")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = pk.Close() })
	return &Handlers{twofa: tf, passkey: pk, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

// The whole point of the tri-state. A downed twofa-service must not turn into
// "this user has no 2FA" — that is indistinguishable from the bug being fixed.
func TestFactorsAreUnknownWhenTheServicesAreUnreachable(t *testing.T) {
	h := deadFactorHandlers(t)

	totp, passkeys := h.factors(t.Context(), []string{"u1"}, true)

	assert.Assert(t, totp == nil, "an unreachable twofa-service must yield unknown, not off")
	assert.Assert(t, passkeys == nil, "an unreachable passkey-service must yield unknown, not off")
	assert.Assert(t, totp.state("u1") == nil)
	assert.Assert(t, passkeys.state("u1") == nil)
}

// /api/auth/me runs on every page load and nothing there consumes the passkey
// flag, so it must not pay for the round trip. Pinned because the saving is
// invisible and a later refactor would happily "simplify" it away.
func TestFactorsSkipThePasskeyLookupWhenNotWanted(t *testing.T) {
	h := deadFactorHandlers(t)

	_, passkeys := h.factors(t.Context(), []string{"u1"}, false)

	assert.Assert(t, passkeys == nil)
}

// No ids means no rows to render — and no reason to call either service. The
// sets are empty, not unknown: "nobody" is a real answer here.
func TestFactorsSkipBothServicesOnAnEmptyBatch(t *testing.T) {
	h := deadFactorHandlers(t)

	totp, passkeys := h.factors(t.Context(), nil, true)

	assert.Assert(t, totp != nil, "an empty batch is answered, not unknown")
	assert.Assert(t, passkeys != nil)
}
