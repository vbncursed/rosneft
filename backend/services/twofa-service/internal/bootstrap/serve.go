// Package bootstrap wires the twofa service.
package bootstrap

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
)

// RunServe starts the gRPC server. Filled in Task 8.
func RunServe(ctx context.Context, cfg config.Config) error { return nil }

// RunMigrateUp/Down/Status are filled in Task 4.
func RunMigrateUp(ctx context.Context, cfg config.Config) error     { return nil }
func RunMigrateDown(ctx context.Context, cfg config.Config) error   { return nil }
func RunMigrateStatus(ctx context.Context, cfg config.Config) error { return nil }
