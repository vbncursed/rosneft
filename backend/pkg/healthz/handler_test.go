package healthz_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

type HandlerSuite struct{ suite.Suite }

func TestHandlerSuite(t *testing.T) { suite.Run(t, new(HandlerSuite)) }

// TestCheckAllPassesWithNoProbes covers grpcutil.WatchReadiness's use of
// CheckAll as a ReadinessConfig.Probe: a service with nothing registered yet
// must read as ready, matching Ready's own zero-probes shortcut.
func (s *HandlerSuite) TestCheckAllPassesWithNoProbes() {
	h := healthz.New(healthz.Config{Service: "svc"})
	err := h.CheckAll(s.T().Context())
	assert.NilError(s.T(), err)
}

func (s *HandlerSuite) TestCheckAllPassesWhenEveryProbePasses() {
	h := healthz.New(healthz.Config{Service: "svc"})
	h.Register("a", func(context.Context) error { return nil })
	h.Register("b", func(context.Context) error { return nil })

	err := h.CheckAll(s.T().Context())
	assert.NilError(s.T(), err)
}

func (s *HandlerSuite) TestCheckAllJoinsFailingProbesByName() {
	h := healthz.New(healthz.Config{Service: "svc"})
	h.Register("ok", func(context.Context) error { return nil })
	h.Register("catalog", func(context.Context) error { return errors.New("dial refused") })

	err := h.CheckAll(s.T().Context())

	assert.ErrorContains(s.T(), err, "catalog")
	assert.ErrorContains(s.T(), err, "dial refused")
}
