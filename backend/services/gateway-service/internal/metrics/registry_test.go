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
