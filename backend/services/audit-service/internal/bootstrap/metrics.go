package bootstrap

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// A failed witness write leaves the digest only in Postgres, where it protects
// against nobody who can edit Postgres. It is a silent degradation of the whole
// point of checkpointing, so it gets its own alertable counter rather than
// living in the logs alone.
var metricDigestWriteFailures = prometheus.NewCounter(prometheus.CounterOpts{
	Name: "audit_digest_write_failures_total",
	Help: "Checkpoint digests that could not be appended to the witness file.",
})

func init() { metrics.Registry.MustRegister(metricDigestWriteFailures) }
