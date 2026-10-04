package metrics

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type RegistrySuite struct {
	suite.Suite
}

func TestRegistrySuite(t *testing.T) {
	suite.Run(t, new(RegistrySuite))
}

func (s *RegistrySuite) TestServicesUpIsAnInstantPerServiceQuery() {
	p, ok := lookup("services-up")
	assert.Assert(s.T(), ok)
	assert.Assert(s.T(), p.instant)
	assert.Equal(s.T(), p.expr, `up{job="services"}`)
}

// An expired cookie, a wrong password or a 404 is the service working, not
// failing. Only the codes that map to HTTP 5xx count, or one stale session
// paints auth "degraded" for the whole rate window.
func (s *RegistrySuite) TestRedErrorsCountsServerFaultsOnly() {
	p, ok := lookup("red-errors")
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), p.expr,
		`sum by (service)(rate(grpc_server_handled_total{grpc_code=~"Unknown|DeadlineExceeded|Unimplemented|Internal|Unavailable|DataLoss"}[5m]))`)
}
