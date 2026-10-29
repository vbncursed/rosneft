package totp_test

import (
	"testing"
	"time"

	pqtotp "github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

type TOTPSuite struct {
	suite.Suite
}

func TestTOTPSuite(t *testing.T) {
	suite.Run(t, new(TOTPSuite))
}

func (s *TOTPSuite) TestTOTPRoundTrip() {
	secret, url, err := totp.Generate("Andrey", "ivan")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), secret != "")
	assert.Assert(s.T(), len(url) > 0)

	// Generate a current code the same way an authenticator app would.
	code, err := pqtotp.GenerateCode(secret, time.Now())
	assert.NilError(s.T(), err)
	_, ok := totp.Validate(secret, code)
	assert.Assert(s.T(), ok)
	_, ok = totp.Validate(secret, "000000")
	assert.Assert(s.T(), !ok)
}

// Validate names the time step the code belongs to: the replay guard keys on
// it. A code from the previous step is still accepted (clock skew) but reports
// that earlier step, so it cannot be mistaken for a fresh one.
func (s *TOTPSuite) TestValidateReportsTheMatchedStep() {
	secret, _, err := totp.Generate("Andrey", "ivan")
	assert.NilError(s.T(), err)
	before := time.Now().Unix() / 30
	prev, err := pqtotp.GenerateCode(secret, time.Now().Add(-30*time.Second))
	assert.NilError(s.T(), err)
	after := time.Now().Unix() / 30

	step, ok := totp.Validate(secret, prev)

	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), step >= before-1 && step <= after-1, "step %d, want %d..%d", step, before-1, after-1)
}

func (s *TOTPSuite) TestRecoveryCodes() {
	plain, hashes, err := totp.GenerateRecovery(5)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(plain), 5)
	assert.Equal(s.T(), len(hashes), 5)

	idx, ok := totp.MatchRecovery(plain[2], hashes)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), idx, 2)

	_, ok = totp.MatchRecovery("nope-nope", hashes)
	assert.Assert(s.T(), !ok)
}
