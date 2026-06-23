// Package users is the PostgreSQL store for accounts and their role bindings.
// One query per file; this file holds the struct + constructor + shared helpers.
package users

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the users persistence adapter.
type Store struct{ pool *pgxpool.Pool }

// New wraps a pgxpool.Pool.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const pgUniqueViolation = "23505"

func constraintOf(err error) string {
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == pgUniqueViolation {
		return pgErr.ConstraintName
	}
	return ""
}
