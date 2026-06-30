package users

import "testing"

func TestPickOwningAdmin(t *testing.T) {
	tests := []struct {
		name  string
		chain []ChainNode
		want  string
	}{
		{"caller is root", []ChainNode{{ID: "root", IsOwner: true}}, ""},
		{"admin directly under root", []ChainNode{{ID: "admin", IsOwner: false}, {ID: "root", IsOwner: true}}, "admin"},
		{"manager under admin under root", []ChainNode{{ID: "mgr", IsOwner: false}, {ID: "admin", IsOwner: false}, {ID: "root", IsOwner: true}}, "admin"},
		{"orphan with no root ancestor", []ChainNode{{ID: "a", IsOwner: false}, {ID: "b", IsOwner: false}}, "b"},
		{"single non-root self", []ChainNode{{ID: "solo", IsOwner: false}}, "solo"},
		{"empty chain", nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := pickOwningAdmin(tt.chain); got != tt.want {
				t.Errorf("pickOwningAdmin() = %q, want %q", got, tt.want)
			}
		})
	}
}
