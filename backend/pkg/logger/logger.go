// Package logger creates structured slog loggers configured from a small
// Config struct. Used by every service to ensure consistent JSON logs in
// production and human-readable text logs in development.
package logger

import (
	"io"
	"log/slog"
	"strings"
)

// Config controls logger construction.
type Config struct {
	// Level is one of: "debug", "info", "warn", "error". Empty defaults to "info".
	Level string
	// Format is "json" (default) or "text".
	Format string
	// AddSource adds file:line of the log call to every record.
	AddSource bool
}

// New returns a slog.Logger writing to w with the configured options.
func New(w io.Writer, cfg Config) *slog.Logger {
	opts := &slog.HandlerOptions{
		Level:     parseLevel(cfg.Level),
		AddSource: cfg.AddSource,
	}

	var h slog.Handler
	switch strings.ToLower(cfg.Format) {
	case "text":
		h = slog.NewTextHandler(w, opts)
	default:
		h = slog.NewJSONHandler(w, opts)
	}

	return slog.New(h)
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
