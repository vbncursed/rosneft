package password_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
)

type PasswordSuite struct {
	suite.Suite
}

func TestPasswordSuite(t *testing.T) {
	suite.Run(t, new(PasswordSuite))
}

func (s *PasswordSuite) TestHashVerifyRoundTrip() {
	enc, err := password.Hash("s3cret-pw")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), enc != "s3cret-pw") // not plaintext

	ok, err := password.Verify("s3cret-pw", enc)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok)

	bad, err := password.Verify("wrong", enc)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !bad)
}

func (s *PasswordSuite) TestHashIsSalted() {
	a, _ := password.Hash("same")
	b, _ := password.Hash("same")
	assert.Assert(s.T(), a != b) // random salt → different encodings
}
