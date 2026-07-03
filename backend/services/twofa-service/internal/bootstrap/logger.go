// Package bootstrap wires the twofa service together. One Init function per
// file; lifecycle entry points (RunServe, RunMigrate*) live alongside the
// components they drive.
package bootstrap

import (
	"log/slog"
	"os"

	pkglogger "github.com/vbncursed/rosneft/backend/pkg/logger"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/config"
)

// InitLogger builds the process-wide structured logger and installs it as the
// slog default.
func InitLogger(cfg config.Config) *slog.Logger {
	logger := pkglogger.New(os.Stdout, pkglogger.Config{Level: cfg.LogLevel, Format: cfg.LogFormat})
	slog.SetDefault(logger)
	return logger
}
