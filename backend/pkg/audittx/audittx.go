// Package audittx runs a mutation inside a transaction that carries the
// request's actor, so the audit_capture() trigger can attribute the change.
//
// The transaction is not optional: SET LOCAL has no effect outside a
// transaction block, and the trigger fires in the same transaction as the
// statement that caused it.
package audittx

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

const setActor = `SELECT set_config('app.actor_id', $1, true),
                         set_config('app.company_id', $2, true),
                         set_config('app.request_id', $3, true)`

// Run opens a transaction, publishes the ctx actor into transaction-local
// settings, and executes fn against that transaction.
//
// A ctx with no actor — the mesh-worker reconciler, migrations — leaves the
// settings unset; the trigger reads them with missing_ok and records NULL
// rather than failing. Background work is logged as a system change, never
// dropped.
func Run(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if a := grpcutil.ActorFromContext(ctx); a.ID != "" {
			if _, err := tx.Exec(ctx, setActor, a.ID, a.Company, grpcutil.RequestIDFromContext(ctx)); err != nil {
				return fmt.Errorf("audittx: publish actor: %w", err)
			}
		}
		return fn(tx)
	})
}
