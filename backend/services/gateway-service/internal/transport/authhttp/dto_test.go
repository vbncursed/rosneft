package authhttp

import (
	"encoding/json"
	"testing"

	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// The bug this whole change exists to remove: auth-service never fills
// totp_enabled, so anything reading the proto field reports "off" for everyone.
// The value has to come from the overlaid set and nowhere else.
func TestUserToJSONTakesTheFactorsFromTheSetsNotTheProto(t *testing.T) {
	u := &authv1.User{Id: "u1", TotpEnabled: false}

	out := userToJSON(u, factorSet{"u1": {}}, factorSet{})

	assert.Assert(t, out.TOTPEnabled != nil)
	assert.Equal(t, *out.TOTPEnabled, true)
	assert.Assert(t, out.PasskeyEnabled != nil)
	assert.Equal(t, *out.PasskeyEnabled, false)
}

// A nil set is not an empty one. Empty means "asked, nobody has it"; nil means
// the owning service never answered, and answering "No" for it is the bug.
func TestANilSetMeansUnknownNotOff(t *testing.T) {
	u := &authv1.User{Id: "u1"}

	out := userToJSON(u, nil, nil)

	assert.Assert(t, out.TOTPEnabled == nil)
	assert.Assert(t, out.PasskeyEnabled == nil)
}

// Unknown must reach the client as an absent key, not as JSON null and not as
// false — the SPA renders "—" off the absence.
func TestUnknownFactorsAreOmittedFromTheJSON(t *testing.T) {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, nil, nil))

	assert.NilError(t, err)
	assert.Assert(t, !jsonHasKey(t, body, "totpEnabled"))
	assert.Assert(t, !jsonHasKey(t, body, "passkeyEnabled"))
}

// A known-false factor must still be sent: absent and false mean different
// things, and omitempty on a *bool omits only nil.
func TestAKnownFalseFactorIsStillSent(t *testing.T) {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, factorSet{}, factorSet{}))

	assert.NilError(t, err)
	assert.Assert(t, jsonHasKey(t, body, "totpEnabled"))
	assert.Assert(t, jsonHasKey(t, body, "passkeyEnabled"))
}

// Each user is resolved against its own id, not the first one in the batch.
func TestUsersToJSONResolvesEachUserSeparately(t *testing.T) {
	in := []*authv1.User{{Id: "a"}, {Id: "b"}}

	out := usersToJSON(in, factorSet{"b": {}}, factorSet{"a": {}})

	assert.Equal(t, len(out), 2)
	assert.Equal(t, *out[0].TOTPEnabled, false)
	assert.Equal(t, *out[0].PasskeyEnabled, true)
	assert.Equal(t, *out[1].TOTPEnabled, true)
	assert.Equal(t, *out[1].PasskeyEnabled, false)
}

func jsonHasKey(t *testing.T, body []byte, key string) bool {
	t.Helper()
	var m map[string]json.RawMessage
	assert.NilError(t, json.Unmarshal(body, &m))
	_, ok := m[key]
	return ok
}
