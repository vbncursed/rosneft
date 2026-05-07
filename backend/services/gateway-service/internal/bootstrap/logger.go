// Package bootstrap wires the gateway service together. One Init function
// per file; the lifecycle entry point RunServe orchestrates them.
package bootstrap

import (
	"log/slog"
	"os"

	pkglogger "github.com/vbncursed/rosneft/backend/pkg/logger"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// InitLogger builds the process-wide structured logger and installs it.
func InitLogger(cfg config.Config) *slog.Logger {
	logger := pkglogger.New(os.Stdout, pkglogger.Config{
		Level:  cfg.LogLevel,
		Format: cfg.LogFormat,
	})
	slog.SetDefault(logger)
	return logger
}
