package session

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type StoreKeysSuite struct{ suite.Suite }

func TestStoreKeysSuite(t *testing.T) { suite.Run(t, new(StoreKeysSuite)) }

// changePasswordFailKey and failKey must live under different top-level Redis
// prefixes. Login passes its identifier into failKey completely unvalidated
// (grpcapi/login.go → auth.Login only checks non-empty), so if the two key
// functions ever shared a prefix, an attacker could pick an identifier that
// makes failKey(identifier) collide with changePasswordFailKey(victimUserID)
// — no session or credentials required, since Login registers a fail before
// it even knows whether the identifier maps to a real account. Checking the
// prefixes are disjoint is a stronger, general guarantee than checking any
// finite list of concrete inputs: it holds for every userID and every
// identifier, not just the ones a test happens to enumerate.
func (s *StoreKeysSuite) TestChangePasswordFailKeyPrefixNeverAliasesLoginFailKey() {
	assert.Assert(s.T(), !strings.HasPrefix(failKeyPrefix, changePasswordFailKeyPrefix))
	assert.Assert(s.T(), !strings.HasPrefix(changePasswordFailKeyPrefix, failKeyPrefix))
}

// Concrete regression cases, including the exact payload from the reported
// attack (identifier = "changepw:" + victim userID, the vulnerable prefix
// from the first attempt at this fix) and a few adjacent attempts at
// reconstructing the change-password key from Login's unvalidated input.
func (s *StoreKeysSuite) TestChangePasswordFailKeyNeverAliasesFailKey() {
	userIDs := []string{"u1", "00000000-0000-0000-0000-000000000042", ""}
	attackerIdentifiers := []string{
		"changepw:u1",
		"changepw_fail:u1",
		"login_fail:changepw_fail:u1",
		"u1",
		"",
	}
	for _, uid := range userIDs {
		cpKey := changePasswordFailKey(uid)
		for _, ident := range attackerIdentifiers {
			assert.Assert(s.T(), cpKey != failKey(ident))
		}
	}
}
