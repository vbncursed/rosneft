package auth

import (
	"testing"

	"gotest.tools/v3/assert"
)

func TestScopeOwningAdmin(t *testing.T) {
	tests := []struct {
		name          string
		roleSlugs     []string
		resolvedAdmin string
		selfID        string
		want          string
	}{
		{"non-guest inherits tenant admin", []string{"owner"}, "admin-1", "u1", "admin-1"},
		{"guest scoped to self", []string{"guest"}, "admin-1", "u1", "u1"},
		{"guest among other roles still self", []string{"viewer", "guest"}, "admin-1", "u1", "u1"},
		{"no roles inherits resolved", nil, "admin-1", "u1", "admin-1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, scopeOwningAdmin(tt.roleSlugs, tt.resolvedAdmin, tt.selfID), tt.want)
		})
	}
}
