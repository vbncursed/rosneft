package healthz_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

type HealthzSuite struct {
	suite.Suite
	handler *healthz.Handler
	server  *httptest.Server
}

func TestHealthzSuite(t *testing.T) {
	suite.Run(t, new(HealthzSuite))
}

func (s *HealthzSuite) newServer(cfg healthz.Config) {
	s.handler = healthz.New(cfg)
	mux := http.NewServeMux()
	s.handler.Mount(mux)
	s.server = httptest.NewServer(mux)
}

func (s *HealthzSuite) TearDownTest() {
	if s.server != nil {
		s.server.Close()
		s.server = nil
	}
	s.handler = nil
}

func (s *HealthzSuite) get(path string) (int, map[string]any) {
	resp, err := http.Get(s.server.URL + path)
	assert.NilError(s.T(), err)
	defer resp.Body.Close()

	var body map[string]any
	assert.NilError(s.T(), json.NewDecoder(resp.Body).Decode(&body))
	return resp.StatusCode, body
}

func (s *HealthzSuite) TestLiveness_alwaysOK() {
	s.newServer(healthz.Config{Service: "test", Version: "0.0.1"})

	status, body := s.get("/healthz")
	assert.Equal(s.T(), status, http.StatusOK)
	assert.Equal(s.T(), body["service"], "test")
	assert.Equal(s.T(), body["version"], "0.0.1")
}

func (s *HealthzSuite) TestReadiness_notReadyByDefault() {
	s.newServer(healthz.Config{Service: "test"})

	status, body := s.get("/readyz")
	assert.Equal(s.T(), status, http.StatusServiceUnavailable)
	assert.Equal(s.T(), body["status"], "not_ready")
}

func (s *HealthzSuite) TestReadiness_okAfterMarkReady() {
	s.newServer(healthz.Config{Service: "test"})
	s.handler.MarkReady()

	status, body := s.get("/readyz")
	assert.Equal(s.T(), status, http.StatusOK)
	assert.Equal(s.T(), body["status"], "ok")
}

func (s *HealthzSuite) TestReadiness_probeFailureReports503() {
	s.newServer(healthz.Config{Service: "test"})
	s.handler.Register("db", func(_ context.Context) error { return errors.New("connection refused") })
	s.handler.Register("redis", func(_ context.Context) error { return nil })
	s.handler.MarkReady()

	status, body := s.get("/readyz")
	assert.Equal(s.T(), status, http.StatusServiceUnavailable)

	checks, ok := body["checks"].(map[string]any)
	assert.Assert(s.T(), ok, "checks not a map: %T", body["checks"])

	dbCheck, _ := checks["db"].(string)
	assert.Assert(s.T(), strings.Contains(dbCheck, "connection refused"), "db=%q", dbCheck)
	assert.Equal(s.T(), checks["redis"], "ok")
}

func (s *HealthzSuite) TestReadiness_respectsProbeTimeout() {
	s.newServer(healthz.Config{Service: "test", Timeout: 50 * time.Millisecond})
	s.handler.Register("slow", func(ctx context.Context) error {
		select {
		case <-time.After(time.Second):
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	})
	s.handler.MarkReady()

	start := time.Now()
	status, _ := s.get("/readyz")
	elapsed := time.Since(start)

	assert.Equal(s.T(), status, http.StatusServiceUnavailable)
	assert.Assert(s.T(), elapsed < 500*time.Millisecond, "elapsed=%v want <500ms", elapsed)
}

func (s *HealthzSuite) TestMarkNotReady_flipsBack() {
	s.newServer(healthz.Config{Service: "test"})
	s.handler.MarkReady()
	s.handler.MarkNotReady()

	status, _ := s.get("/readyz")
	assert.Equal(s.T(), status, http.StatusServiceUnavailable)
}

func (s *HealthzSuite) TestReadiness_probesRunConcurrently() {
	s.newServer(healthz.Config{Service: "test", Timeout: time.Second})
	probe := func(_ context.Context) error {
		time.Sleep(100 * time.Millisecond)
		return nil
	}
	for i := range 5 {
		s.handler.Register(string(rune('a'+i)), probe)
	}
	s.handler.MarkReady()

	start := time.Now()
	status, _ := s.get("/readyz")
	elapsed := time.Since(start)

	assert.Equal(s.T(), status, http.StatusOK)
	// Sequential would be ~500ms; concurrent should be ~100ms plus overhead.
	assert.Assert(s.T(), elapsed < 300*time.Millisecond, "elapsed=%v, want <300ms (probes should run concurrently)", elapsed)
}
