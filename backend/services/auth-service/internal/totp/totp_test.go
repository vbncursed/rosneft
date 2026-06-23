package totp_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
)

func TestTOTPRoundTrip(t *testing.T) {
	secret, url, err := totp.Generate("Rosneft", "ivan")
	assert.NilError(t, err)
	assert.Assert(t, secret != "")
	assert.Assert(t, len(url) > 0)

	code, err := totp.GenerateNow(secret)
	assert.NilError(t, err)
	assert.Assert(t, totp.Validate(secret, code))
	assert.Assert(t, !totp.Validate(secret, "000000"))
}

func TestRecoveryCodes(t *testing.T) {
	plain, hashes, err := totp.GenerateRecovery(5)
	assert.NilError(t, err)
	assert.Equal(t, len(plain), 5)
	assert.Equal(t, len(hashes), 5)

	idx, ok := totp.MatchRecovery(plain[2], hashes)
	assert.Assert(t, ok)
	assert.Equal(t, idx, 2)

	_, ok = totp.MatchRecovery("nope-nope", hashes)
	assert.Assert(t, !ok)
}
