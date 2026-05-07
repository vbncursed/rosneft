// Package bootstrap wires the catalog service together. One Init function per
// file (storage, service, transport, ...); lifecycle entry points (RunServe,
// RunMigrate*, RunSeed) live alongside the components they drive.
package bootstrap

import (
	"log/slog"
	"os"

	pkglogger "github.com/vbncursed/rosneft/backend/pkg/logger"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/config"
)

// InitLogger builds the process-wide structured logger from cfg and installs
// it as slog.Default so every package picks it up.
func InitLogger(cfg config.Config) *slog.Logger {
	logger := pkglogger.New(os.Stdout, pkglogger.Config{
		Level:  cfg.LogLevel,
		Format: cfg.LogFormat,
	})
	slog.SetDefault(logger)
	return logger
}
