// Package storage is the PostgreSQL persistence layer for the catalog service.
// One method per file. This file holds only the struct + constructor; column
// constants and scan helpers live in models.go.
package storage

import "github.com/jackc/pgx/v5/pgxpool"

// PG is the PostgreSQL storage adapter.
type PG struct {
	pool *pgxpool.Pool
}

// New wraps a pgxpool.Pool. The caller owns the pool and must close it.
func New(pool *pgxpool.Pool) *PG {
	return &PG{pool: pool}
}
