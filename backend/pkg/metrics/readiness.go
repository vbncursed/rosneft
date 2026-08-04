package metrics

import "github.com/prometheus/client_golang/prometheus"

// serviceReady is 1 while the service's dependencies answered their last probe.
//
// It exists because `up` cannot answer the question: a process whose Postgres
// pool has died still serves /metrics, so `up` stays 1 and TargetDown never
// fires. This gauge makes Prometheus the poller of readiness, which is the
// only poller the stack has.
var serviceReady = prometheus.NewGaugeVec(prometheus.GaugeOpts{
	Name: "service_ready",
	Help: "1 when the service's dependencies answered their last probe, 0 otherwise.",
}, []string{"service"})

func init() { Registry.MustRegister(serviceReady) }

// SetReady publishes the readiness of one service.
func SetReady(service string, ready bool) {
	v := 0.0
	if ready {
		v = 1
	}
	serviceReady.WithLabelValues(service).Set(v)
}
