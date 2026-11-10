//go:build integration

package users_test

import "gotest.tools/v3/assert"

func (s *CreateSuite) TestResolveLogins() {
	a, err := s.create("resolve-a@example.com", "resolve-a")
	assert.NilError(s.T(), err)
	b, err := s.create("resolve-b@example.com", "resolve-b")
	assert.NilError(s.T(), err)
	_, err = s.create("resolve-unseen@example.com", "resolve-unseen")
	assert.NilError(s.T(), err)
	for _, tc := range []struct {
		name string
		ids  []string
		want map[string]string
	}{
		{"empty", []string{}, map[string]string{}},
		{"known and unknown with duplicate", []string{a.ID, "00000000-0000-0000-0000-000000000000", b.ID, a.ID}, map[string]string{a.ID: a.Username, b.ID: b.Username}},
		{"unknown only", []string{"00000000-0000-0000-0000-000000000000"}, map[string]string{}},
	} {
		s.Run(tc.name, func() {
			got, err := s.store.ResolveLogins(s.T().Context(), tc.ids)
			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(), got, tc.want)
		})
	}
}
