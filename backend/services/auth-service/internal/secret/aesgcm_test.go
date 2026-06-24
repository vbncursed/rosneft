package secret_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

type SecretSuite struct {
	suite.Suite
}

func TestSecretSuite(t *testing.T) {
	suite.Run(t, new(SecretSuite))
}

func (s *SecretSuite) TestEncryptDecryptRoundTrip() {
	c, err := secret.NewCipher(strings.Repeat("a", 64)) // 32 bytes hex
	assert.NilError(s.T(), err)

	ct, err := c.Encrypt([]byte("totp-secret"))
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), string(ct) != "totp-secret")

	pt, err := c.Decrypt(ct)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(pt), "totp-secret")
}

func (s *SecretSuite) TestNewTokenIsRandomAndURLSafe() {
	a, err := secret.NewToken()
	assert.NilError(s.T(), err)
	b, _ := secret.NewToken()
	assert.Assert(s.T(), a != b)
	assert.Assert(s.T(), !strings.ContainsAny(a, "+/="))
}
