package bootstrap

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

func freeAddr(t *testing.T) string {
	t.Helper()
	lis, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	addr := lis.Addr().String()
	assert.NilError(t, lis.Close())
	return addr
}

// serveConfig points every backend at a dead address: gRPC dials are lazy, so
// RunServe starts and /healthz answers while /readyz would report degraded.
func serveConfig(t *testing.T) config.Config {
	t.Helper()
	dead := "127.0.0.1:1"
	return config.Config{
		HTTPAddr:        freeAddr(t),
		MetricsAddr:     freeAddr(t),
		CatalogGRPCAddr: dead, ContentGRPCAddr: dead, MeshGRPCAddr: dead, UploadGRPCAddr: dead,
		AuthGRPCAddr: dead, TwoFAGRPCAddr: dead, PasskeyGRPCAddr: dead, AuditGRPCAddr: dead,
		AssetHTTPAddr:   "http://" + dead,
		PrometheusURL:   "http://" + dead,
		LogLevel:        "error",
		LogFormat:       "json",
		ReadTimeout:     5 * time.Second,
		WriteTimeout:    5 * time.Second,
		IdleTimeout:     5 * time.Second,
		ShutdownTimeout: 5 * time.Second,
		CSRFSecret:      "test-secret",
	}
}

func getStatus(ctx context.Context, url string) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	return resp.StatusCode, nil
}

// RunServe serves HTTP, and a cancelled context is a clean shutdown (nil) that
// releases the port.
func TestRunServeServesAndShutsDownCleanly(t *testing.T) {
	cfg := serveConfig(t)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- RunServe(ctx, cfg) }()

	url := "http://" + cfg.HTTPAddr + "/healthz"
	assert.Assert(t, func() bool {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if code, err := getStatus(t.Context(), url); err == nil && code == http.StatusOK {
				return true
			}
			time.Sleep(20 * time.Millisecond)
		}
		return false
	}(), "gateway never answered /healthz")

	cancel()
	select {
	case err := <-done:
		assert.NilError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("RunServe did not return after cancel")
	}
	_, err := getStatus(t.Context(), url)
	assert.Assert(t, err != nil, "port must be released after shutdown")
}

// A listener that cannot bind is an error from RunServe, not a hang.
func TestRunServeListenFailure(t *testing.T) {
	cfg := serveConfig(t)
	busy, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = busy.Close() })
	cfg.HTTPAddr = busy.Addr().String()

	err = RunServe(t.Context(), cfg)

	assert.ErrorContains(t, err, "http serve:")
}

func readyStatus(hz *healthz.Handler) int {
	rec := httptest.NewRecorder()
	hz.Ready(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	return rec.Code
}

// Readiness must already read not-ready when Shutdown starts, so the balancer
// stops sending traffic before the drain begins.
func TestShutdownHTTPFlipsReadinessBeforeShutdown(t *testing.T) {
	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	hz.MarkReady()
	assert.Equal(t, readyStatus(hz), http.StatusOK)
	srv := &http.Server{ReadHeaderTimeout: time.Second}
	seen := make(chan int, 1) // OnShutdown hooks run in their own goroutine
	srv.RegisterOnShutdown(func() { seen <- readyStatus(hz) })

	shutdownHTTP(srv, hz, time.Second, slog.New(slog.DiscardHandler))

	assert.Equal(t, <-seen, http.StatusServiceUnavailable)
}

// A request that outlives ShutdownTimeout does not hang the process: the drain
// gives up when the timeout ends.
func TestShutdownHTTPGivesUpAtTheTimeout(t *testing.T) {
	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	release := make(chan struct{})
	started := make(chan struct{})
	srv := &http.Server{
		ReadHeaderTimeout: time.Second,
		Handler: http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			close(started)
			<-release
		}),
	}
	lis, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	go func() { _ = srv.Serve(lis) }()
	defer close(release)
	go func() { _, _ = getStatus(t.Context(), "http://"+lis.Addr().String()) }()
	<-started

	begin := time.Now()
	shutdownHTTP(srv, hz, 100*time.Millisecond, slog.New(slog.DiscardHandler))

	assert.Assert(t, time.Since(begin) < 3*time.Second, "shutdown must stop waiting at the timeout")
	assert.Assert(t, time.Since(begin) >= 100*time.Millisecond)
	_ = srv.Close()
}
