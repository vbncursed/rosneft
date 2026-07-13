package auth

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

var metricLogins = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "auth_logins_total",
	Help: "Password login attempts, by status (succeeded|failed).",
}, []string{"status"})

func init() { metrics.Registry.MustRegister(metricLogins) }
