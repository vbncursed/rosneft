// Package permissions is the read-only PostgreSQL store for the permission catalog.
package permissions

import "github.com/jackc/pgx/v5/pgxpool"

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }
