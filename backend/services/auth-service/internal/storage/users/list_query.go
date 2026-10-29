package users

import (
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// listQuery builds List's SELECT and its positional arguments. Every caller
// value travels as an argument ($N); only placeholder numbers are formatted in.
func listQuery(status string, includeDeleted bool, ownerID, hidePrivilegedExcept string) (string, []any) {
	q := `SELECT ` + userColumns + ` FROM users u WHERE 1=1`
	args := make([]any, 0, 4)
	if ownerID != "" {
		q, args = withOwner(q, args, ownerID)
	}
	if hidePrivilegedExcept != "" {
		q, args = withoutPrivileged(q, args, hidePrivilegedExcept)
	}
	q, args = withStatus(q, args, status, includeDeleted)
	return q + " ORDER BY u.created_at", args
}

// withOwner keeps the users ownerID created plus its own row.
func withOwner(q string, args []any, ownerID string) (string, []any) {
	args = append(args, ownerID)
	// A Company Owner's own row is created by Root, not by the owner —
	// created_by alone would hide the owner from their own list.
	return q + fmt.Sprintf(" AND (u.created_by = $%d OR u.id = $%d)", len(args), len(args)), args
}

// withoutPrivileged drops Root and every admin-role holder except self's row.
func withoutPrivileged(q string, args []any, self string) (string, []any) {
	args = append(args, self, domain.RoleAdmin)
	return q + fmt.Sprintf(` AND (u.id = $%d OR (NOT u.is_owner AND NOT EXISTS (
			SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
			WHERE ur.user_id = u.id AND r.slug = $%d)))`, len(args)-1, len(args)), args
}

// withStatus filters on one status, or else hides soft-deleted rows.
func withStatus(q string, args []any, status string, includeDeleted bool) (string, []any) {
	if status != "" {
		args = append(args, status)
		return q + fmt.Sprintf(" AND u.status = $%d", len(args)), args
	}
	if !includeDeleted {
		return q + " AND u.status <> 'deleted'", args
	}
	return q, args
}
