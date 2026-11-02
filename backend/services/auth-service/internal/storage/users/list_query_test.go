package users

import (
	"fmt"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Hand-written fragments of what List asks Postgres, one per filter.
var (
	base = "SELECT " + userColumns + " FROM users u WHERE 1=1"
	// A Company Owner's own row is created by Root, so created_by alone would hide it.
	notDeleted = " AND u.status <> 'deleted'"
	orderBy    = " ORDER BY u.created_at"
)

// The owner filter always comes first, so its placeholder is always $1.
const owner = " AND (u.created_by = $1 OR u.id = $1)"

func hidden(self, role int) string {
	return fmt.Sprintf(" AND (u.id = $%d OR (NOT u.is_owner AND NOT EXISTS (\n"+
		"\t\t\tSELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id\n"+
		"\t\t\tWHERE ur.user_id = u.id AND r.slug = $%d)))", self, role)
}

func status(n int) string { return fmt.Sprintf(" AND u.status = $%d", n) }

// Every combination of List's four filters: the text and the positional
// arguments, in order. Filters only ever add parameters, never concatenate a
// caller's value into the text.
func TestListQuery(t *testing.T) {
	tests := []struct {
		name                 string
		status               string
		includeDeleted       bool
		ownerID, hidePrivExc string
		wantSQL              string
		wantArgs             []any
	}{
		{
			"status=any deleted=no owner=no hide=no", "", false, "", "",
			base + notDeleted + orderBy,
			[]any{},
		},
		{
			"status=any deleted=no owner=no hide=yes", "", false, "", "me-1",
			base + hidden(1, 2) + notDeleted + orderBy,
			[]any{"me-1", domain.RoleAdmin},
		},
		{
			"status=any deleted=no owner=yes hide=no", "", false, "owner-1", "",
			base + owner + notDeleted + orderBy,
			[]any{"owner-1"},
		},
		{
			"status=any deleted=no owner=yes hide=yes", "", false, "owner-1", "me-1",
			base + owner + hidden(2, 3) + notDeleted + orderBy,
			[]any{"owner-1", "me-1", domain.RoleAdmin},
		},
		{
			"status=any deleted=yes owner=no hide=no", "", true, "", "",
			base + orderBy,
			[]any{},
		},
		{
			"status=any deleted=yes owner=no hide=yes", "", true, "", "me-1",
			base + hidden(1, 2) + orderBy,
			[]any{"me-1", domain.RoleAdmin},
		},
		{
			"status=any deleted=yes owner=yes hide=no", "", true, "owner-1", "",
			base + owner + orderBy,
			[]any{"owner-1"},
		},
		{
			"status=any deleted=yes owner=yes hide=yes", "", true, "owner-1", "me-1",
			base + owner + hidden(2, 3) + orderBy,
			[]any{"owner-1", "me-1", domain.RoleAdmin},
		},
		{
			"status=frozen deleted=no owner=no hide=no", "frozen", false, "", "",
			base + status(1) + orderBy,
			[]any{"frozen"},
		},
		{
			"status=frozen deleted=no owner=no hide=yes", "frozen", false, "", "me-1",
			base + hidden(1, 2) + status(3) + orderBy,
			[]any{"me-1", domain.RoleAdmin, "frozen"},
		},
		{
			"status=frozen deleted=no owner=yes hide=no", "frozen", false, "owner-1", "",
			base + owner + status(2) + orderBy,
			[]any{"owner-1", "frozen"},
		},
		{
			"status=frozen deleted=no owner=yes hide=yes", "frozen", false, "owner-1", "me-1",
			base + owner + hidden(2, 3) + status(4) + orderBy,
			[]any{"owner-1", "me-1", domain.RoleAdmin, "frozen"},
		},
		{
			"status=frozen deleted=yes owner=no hide=no", "frozen", true, "", "",
			base + status(1) + orderBy,
			[]any{"frozen"},
		},
		{
			"status=frozen deleted=yes owner=no hide=yes", "frozen", true, "", "me-1",
			base + hidden(1, 2) + status(3) + orderBy,
			[]any{"me-1", domain.RoleAdmin, "frozen"},
		},
		{
			"status=frozen deleted=yes owner=yes hide=no", "frozen", true, "owner-1", "",
			base + owner + status(2) + orderBy,
			[]any{"owner-1", "frozen"},
		},
		{
			"status=frozen deleted=yes owner=yes hide=yes", "frozen", true, "owner-1", "me-1",
			base + owner + hidden(2, 3) + status(4) + orderBy,
			[]any{"owner-1", "me-1", domain.RoleAdmin, "frozen"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotSQL, gotArgs := listQuery(tc.status, tc.includeDeleted, tc.ownerID, tc.hidePrivExc)

			assert.Equal(t, gotSQL, tc.wantSQL)
			assert.DeepEqual(t, gotArgs, tc.wantArgs)
		})
	}
}
