package totp_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/totp"
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

	code, err := totp.GenerateNow(secret)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), totp.Validate(secret, code))
	assert.Assert(s.T(), !totp.Validate(secret, "000000"))
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
