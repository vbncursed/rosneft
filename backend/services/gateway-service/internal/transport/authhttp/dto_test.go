package authhttp

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// DTOSuite covers the pure user converters: everything they decide is decided
// from the factor sets handed in, which is what makes them testable at all.
type DTOSuite struct{ suite.Suite }

func TestDTOSuite(t *testing.T) { suite.Run(t, new(DTOSuite)) }

// The bug this whole change exists to remove: auth-service never fills
// totp_enabled, so anything reading the proto field reports "off" for everyone.
// The value has to come from the overlaid set and nowhere else.
func (s *DTOSuite) TestUserToJSONTakesTheFactorsFromTheSetsNotTheProto() {
	u := &authv1.User{Id: "u1", TotpEnabled: false}

	out := userToJSON(u, factorSet{"u1": {}}, factorSet{})

	assert.Assert(s.T(), out.TOTPEnabled != nil)
	assert.Equal(s.T(), *out.TOTPEnabled, true)
	assert.Assert(s.T(), out.PasskeyEnabled != nil)
	assert.Equal(s.T(), *out.PasskeyEnabled, false)
}

// A nil set is not an empty one. Empty means "asked, nobody has it"; nil means
// the owning service never answered, and answering "No" for it is the bug.
func (s *DTOSuite) TestANilSetMeansUnknownNotOff() {
	u := &authv1.User{Id: "u1"}

	out := userToJSON(u, nil, nil)

	assert.Assert(s.T(), out.TOTPEnabled == nil)
	assert.Assert(s.T(), out.PasskeyEnabled == nil)
}

// TOTPRequired has no unknown state, unlike the two factors above: it comes
// straight off the proto user, which auth-service always fills, so it round
// trips regardless of what the factor sets say.
func (s *DTOSuite) TestUserToJSONCarriesTOTPRequiredFromTheProto() {
	out := userToJSON(&authv1.User{Id: "u1", TotpRequired: true}, nil, nil)

	assert.Equal(s.T(), out.TOTPRequired, true)
}

// Unknown must reach the client as an absent key, not as JSON null and not as
// false — the SPA renders "—" off the absence.
func (s *DTOSuite) TestUnknownFactorsAreOmittedFromTheJSON() {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, nil, nil))

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !s.jsonHasKey(body, "totpEnabled"))
	assert.Assert(s.T(), !s.jsonHasKey(body, "passkeyEnabled"))
}

// A known-false factor must still be sent: absent and false mean different
// things, and omitempty on a *bool omits only nil.
func (s *DTOSuite) TestAKnownFalseFactorIsStillSent() {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, factorSet{}, factorSet{}))

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), s.jsonHasKey(body, "totpEnabled"))
	assert.Assert(s.T(), s.jsonHasKey(body, "passkeyEnabled"))
}

// Each user is resolved against its own id, not the first one in the batch.
func (s *DTOSuite) TestUsersToJSONResolvesEachUserSeparately() {
	in := []*authv1.User{{Id: "a"}, {Id: "b"}}

	out := usersToJSON(in, factorSet{"b": {}}, factorSet{"a": {}})

	assert.Equal(s.T(), len(out), 2)
	assert.Equal(s.T(), *out[0].TOTPEnabled, false)
	assert.Equal(s.T(), *out[0].PasskeyEnabled, true)
	assert.Equal(s.T(), *out[1].TOTPEnabled, true)
	assert.Equal(s.T(), *out[1].PasskeyEnabled, false)
}

func (s *DTOSuite) jsonHasKey(body []byte, key string) bool {
	s.T().Helper()
	var m map[string]json.RawMessage
	assert.NilError(s.T(), json.Unmarshal(body, &m))
	_, ok := m[key]
	return ok
}
