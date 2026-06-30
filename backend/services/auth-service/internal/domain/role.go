package domain

// Role groups permissions. System roles cannot be modified via the API.
type Role struct {
	Slug            string
	Title           string
	IsSystem        bool
	PermissionSlugs []string
	// OwnerAdminID is the tenant (owning admin) that created this role; only
	// that group sees and manages it. Empty means global (system roles and
	// Root-created roles), visible to everyone.
	OwnerAdminID string
}
