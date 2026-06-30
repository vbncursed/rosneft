package users

// ChainNode is one user on the created_by chain, self-first (ascending depth).
type ChainNode struct {
	ID      string
	IsOwner bool
}

// pickOwningAdmin returns the caller's owning admin: the node directly below the
// first Root encountered walking up. Empty when the caller is a Root. For a
// chain with no Root ancestor, the topmost ancestor is treated as the tenant
// root. A non-Root caller therefore always resolves to a non-empty id.
func pickOwningAdmin(chain []ChainNode) string {
	for i, n := range chain {
		if n.IsOwner {
			if i == 0 {
				return "" // caller itself is a Root
			}
			return chain[i-1].ID
		}
	}
	if len(chain) == 0 {
		return ""
	}
	return chain[len(chain)-1].ID
}
