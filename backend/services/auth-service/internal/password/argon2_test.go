package password_test

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

func TestHashVerifyRoundTrip(t *testing.T) {
	enc, err := password.Hash("s3cret-pw")
	assert.NilError(t, err)
	assert.Assert(t, enc != "s3cret-pw") // not plaintext

	ok, err := password.Verify("s3cret-pw", enc)
	assert.NilError(t, err)
	assert.Assert(t, ok)

	bad, err := password.Verify("wrong", enc)
	assert.NilError(t, err)
	assert.Assert(t, !bad)
}

func TestHashIsSalted(t *testing.T) {
	a, _ := password.Hash("same")
	b, _ := password.Hash("same")
	assert.Assert(t, a != b) // random salt → different encodings
}
