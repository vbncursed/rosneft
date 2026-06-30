package roles

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// createWithDerivedSlug derives a slug from the title and inserts the role,
// suffixing "-2", "-3", … on collision. The DB unique constraint is the
// race-safe backstop, so a concurrent insert that loses just retries.
func (s *Service) createWithDerivedSlug(ctx context.Context, title string, permSlugs []string) (domain.Role, error) {
	base := slugify(title)
	if base == "" {
		base = "role" // ponytail: non-ASCII titles collapse to empty; slug is internal-only now, so "role"/"role-2" is fine
	}
	for i := 0; ; i++ {
		slug := base
		if i > 0 {
			slug = fmt.Sprintf("%s-%d", base, i+1)
		}
		r, err := s.store.Create(ctx, domain.Role{Slug: slug, Title: title, PermissionSlugs: permSlugs})
		if errors.Is(err, domain.ErrRoleSlugTaken) && i < 100 {
			continue
		}
		return r, err
	}
}

// slugify lowercases and reduces runs of non-alphanumerics to single dashes.
func slugify(title string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case !prevDash && b.Len() > 0:
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}
