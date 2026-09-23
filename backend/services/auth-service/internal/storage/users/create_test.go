// In-package test: createError is unexported.
package users

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// Both login constraints answer the one neutral sentinel, so the caller cannot
// tell which of email or username is taken. Anything else stays an internal
// error: a violation of another constraint is not "login taken".
func TestCreateErrorMapsTheLoginConstraints(t *testing.T) {
	unique := func(constraint string) error {
		// Wrapped, as pgx hands it back through QueryRow().Scan().
		return fmt.Errorf("scan: %w", &pgconn.PgError{Code: pgUniqueViolation, ConstraintName: constraint})
	}
	for _, tc := range []struct {
		name  string
		err   error
		taken bool
	}{
		{name: "email", err: unique("users_email_key"), taken: true},
		{name: "username", err: unique("users_username_key"), taken: true},
		{name: "another unique constraint", err: unique("users_pkey")},
		{
			name: "the email constraint, but not a unique violation",
			err:  &pgconn.PgError{Code: "23514", ConstraintName: "users_email_key"},
		},
		{name: "not a Postgres error", err: errors.New("connection reset")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := createError(tc.err)
			assert.Equal(t, errors.Is(got, domain.ErrLoginTaken), tc.taken, "%v", got)
			if !tc.taken {
				assert.ErrorIs(t, got, tc.err)
			}
		})
	}
}
