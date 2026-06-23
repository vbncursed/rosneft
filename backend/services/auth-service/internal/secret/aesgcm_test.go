package secret_test

import (
	"strings"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/secret"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	c, err := secret.NewCipher(strings.Repeat("a", 64)) // 32 bytes hex
	assert.NilError(t, err)

	ct, err := c.Encrypt([]byte("totp-secret"))
	assert.NilError(t, err)
	assert.Assert(t, string(ct) != "totp-secret")

	pt, err := c.Decrypt(ct)
	assert.NilError(t, err)
	assert.Equal(t, string(pt), "totp-secret")
}

func TestNewTokenIsRandomAndURLSafe(t *testing.T) {
	a, err := secret.NewToken()
	assert.NilError(t, err)
	b, _ := secret.NewToken()
	assert.Assert(t, a != b)
	assert.Assert(t, !strings.ContainsAny(a, "+/="))
}
