package healthz_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

func (s *HandlerSuite) TestReadyLifecycle() {
	t := s.T()
	h := healthz.New(healthz.Config{Service: "catalog", Version: "dev"})
	mux := http.NewServeMux()
	h.Mount(mux)

	check := func(path string, status int, body string) {
		t.Helper()
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		assert.Equal(t, w.Code, status)
		assert.Equal(t, w.Header().Get("Content-Type"), "application/json")
		assert.Equal(t, w.Body.String(), body)
	}

	check("/healthz", http.StatusOK, "{\"service\":\"catalog\",\"status\":\"ok\",\"version\":\"dev\"}\n")
	check("/readyz", http.StatusServiceUnavailable, "{\"service\":\"catalog\",\"status\":\"not_ready\"}\n")
	h.MarkReady()
	check("/readyz", http.StatusOK, "{\"service\":\"catalog\",\"status\":\"ok\"}\n")
	h.MarkNotReady()
	check("/readyz", http.StatusServiceUnavailable, "{\"service\":\"catalog\",\"status\":\"not_ready\"}\n")
}

func (s *HandlerSuite) TestReadyProbeResults() {
	t := s.T()
	h := healthz.New(healthz.Config{Service: "catalog"})
	var calls atomic.Int32
	h.Register("db", func(context.Context) error { calls.Add(1); return nil })
	h.Register("cache", func(context.Context) error { return errors.New("unavailable") })
	w := httptest.NewRecorder()

	// Readiness must short-circuit before dependencies are queried.
	h.Ready(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	assert.Equal(t, w.Code, http.StatusServiceUnavailable)
	assert.Equal(t, calls.Load(), int32(0))
	assert.Equal(t, w.Body.String(), "{\"service\":\"catalog\",\"status\":\"not_ready\"}\n")

	h.MarkReady()
	w = httptest.NewRecorder()
	h.Ready(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	assert.Equal(t, w.Code, http.StatusServiceUnavailable)
	assert.Equal(
		t,
		w.Body.String(),
		"{\"checks\":{\"cache\":\"unavailable\",\"db\":\"ok\"},\"service\":\"catalog\",\"status\":\"degraded\"}\n",
	)

	h.Register("cache", func(context.Context) error { return nil })
	w = httptest.NewRecorder()
	h.Ready(w, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	assert.Equal(t, w.Code, http.StatusOK)
	assert.Equal(
		t,
		w.Body.String(),
		"{\"checks\":{\"cache\":\"ok\",\"db\":\"ok\"},\"service\":\"catalog\",\"status\":\"ok\"}\n",
	)
}

func (s *HandlerSuite) TestReadyProbeCancellation() {
	t := s.T()
	for _, tc := range []struct {
		name   string
		cancel bool
		want   string
	}{
		{name: "request cancelled", cancel: true, want: "context canceled"},
		{name: "probe deadline", want: "context deadline exceeded"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				h := healthz.New(healthz.Config{Service: "catalog", Timeout: time.Second})
				h.Register("db", func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() })
				h.MarkReady()
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()
				if tc.cancel {
					cancel()
				}
				w := httptest.NewRecorder()
				h.Ready(w, httptest.NewRequestWithContext(ctx, http.MethodGet, "/readyz", nil))
				assert.Equal(t, w.Code, http.StatusServiceUnavailable)
				assert.Equal(
					t,
					w.Body.String(),
					"{\"checks\":{\"db\":\""+tc.want+"\"},\"service\":\"catalog\",\"status\":\"degraded\"}\n",
				)
			})
		})
	}
}
