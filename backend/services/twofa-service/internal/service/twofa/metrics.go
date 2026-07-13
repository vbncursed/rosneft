package twofa

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

var metricTwofaVerifications = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "twofa_verifications_total",
	Help: "TOTP verifications, by status (succeeded|failed).",
}, []string{"status"})

func init() { metrics.Registry.MustRegister(metricTwofaVerifications) }
