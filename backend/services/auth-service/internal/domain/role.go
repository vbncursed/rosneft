package domain

// Role groups permissions. System roles cannot be deleted via the API.
type Role struct {
	Slug            string
	Title           string
	IsSystem        bool
	PermissionSlugs []string
}
