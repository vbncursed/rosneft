package authhttp

import (
	"io"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// FactorsSuite covers what the gateway does when a factor service does not
// answer. The distinction it guards — unknown versus off — is the entire point
// of the change these tests came with.
type FactorsSuite struct{ suite.Suite }

func TestFactorsSuite(t *testing.T) { suite.Run(t, new(FactorsSuite)) }

// deadHandlers points both factor clients at a port nothing listens on. Dial is
// lazy (grpc.NewClient), so construction succeeds and the RPC fails at call
// time — the exact failure this suite needs, with no interface introduced
// solely for a test. Mirrors HandlersSuite.deadAuth next door.
func (s *FactorsSuite) deadHandlers() *Handlers {
	tf, err := twofa.Dial("127.0.0.1:1")
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = tf.Close() })
	pk, err := passkey.Dial("127.0.0.1:1")
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = pk.Close() })
	return &Handlers{twofa: tf, passkey: pk, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

// The whole point of the tri-state. A downed twofa-service must not turn into
// "this user has no 2FA" — that is indistinguishable from the bug being fixed.
func (s *FactorsSuite) TestFactorsAreUnknownWhenTheServicesAreUnreachable() {
	h := s.deadHandlers()

	totp, passkeys := h.factors(s.T().Context(), []string{"u1"}, true)

	assert.Assert(s.T(), totp == nil, "an unreachable twofa-service must yield unknown, not off")
	assert.Assert(s.T(), passkeys == nil, "an unreachable passkey-service must yield unknown, not off")
	assert.Assert(s.T(), totp.state("u1") == nil)
	assert.Assert(s.T(), passkeys.state("u1") == nil)
}

// /api/auth/me runs on every page load and nothing there consumes the passkey
// flag, so it must not pay for the round trip. Pinned because the saving is
// invisible and a later refactor would happily "simplify" it away.
func (s *FactorsSuite) TestFactorsSkipThePasskeyLookupWhenNotWanted() {
	h := s.deadHandlers()

	_, passkeys := h.factors(s.T().Context(), []string{"u1"}, false)

	assert.Assert(s.T(), passkeys == nil)
}

// No ids means no rows to render — and no reason to call either service. The
// sets are empty, not unknown: "nobody" is a real answer here.
func (s *FactorsSuite) TestFactorsSkipBothServicesOnAnEmptyBatch() {
	h := s.deadHandlers()

	totp, passkeys := h.factors(s.T().Context(), nil, true)

	assert.Assert(s.T(), totp != nil, "an empty batch is answered, not unknown")
	assert.Assert(s.T(), passkeys != nil)
}

// A batch larger than one chunk must still resolve every id, and a failure in
// any chunk must sink the whole set to unknown rather than return a partial one
// — a half-filled set is indistinguishable from "these users have no factor".
func (s *FactorsSuite) TestAnOversizedBatchFailsToUnknownRatherThanPartial() {
	h := s.deadHandlers()
	ids := make([]string, factorBatch+1)
	for i := range ids {
		ids[i] = "u" + string(rune('a'+i%26))
	}

	totp, passkeys := h.factors(s.T().Context(), ids, true)

	assert.Assert(s.T(), totp == nil)
	assert.Assert(s.T(), passkeys == nil)
}
