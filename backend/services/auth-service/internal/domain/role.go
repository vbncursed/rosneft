package domain

// RoleAdmin is the Company Owner role's slug. Holding it hides an account from
// everyone but Root, and only Root may grant it.
const RoleAdmin = "admin"

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

// RoleUpdate is one edit of a role: a new title and, when ReplacePermissions is
// set, a new permission set. The flag, not a nil slice, says "leave the grants
// alone"; an empty PermissionSlugs with the flag set strips them all.
type RoleUpdate struct {
	Slug               string
	Title              string
	PermissionSlugs    []string
	ReplacePermissions bool
}
