package metrics

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type AlertsSuite struct{ suite.Suite }

func TestAlertsSuite(t *testing.T) { suite.Run(t, new(AlertsSuite)) }

func alert(name, service, severity, state string) Series {
	return Series{Label: name, Labels: map[string]string{
		"alertname": name, "service": service, "severity": severity, "alertstate": state,
	}}
}

// Counted the way the SPA's alertsOf groups them: one rule per
// alertname/service/severity, firing if any instance is.
func (s *AlertsSuite) TestFiringRulesCountsRulesNotInstances() {
	got := FiringRules([]Series{
		alert("TargetDown", "mesh-worker", "critical", "firing"),
		alert("TargetDown", "mesh-worker", "critical", "firing"), // second replica
		alert("TargetDown", "mesh-worker", "warning", "firing"),
		alert("HighLatency", "gateway", "warning", "pending"),
	})
	assert.Equal(s.T(), got, 2)
}

func (s *AlertsSuite) TestNothingFiringIsZero() {
	assert.Equal(s.T(), FiringRules(nil), 0)
}
