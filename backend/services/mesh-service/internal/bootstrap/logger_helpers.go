package bootstrap

import "log/slog"

// slogFromCtx returns the default slog logger. Bootstrap installs the logger
// as slog.Default in InitLogger, so any goroutine spawned afterwards can grab
// it through this helper without plumbing.
func slogFromCtx() *slog.Logger {
	return slog.Default()
}
