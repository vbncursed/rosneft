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

// The journal has no retention policy: it is kept forever, on purpose. These
// two exist so "forever" is a decision that gets revisited on evidence rather
// than on the day the disk fills.
var (
	metricJournalRows = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "audit_log_rows",
		Help: "Estimated rows in audit_log (planner statistics, not an exact count).",
	})
	metricJournalBytes = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "audit_log_bytes",
		Help: "Total on-disk size of audit_log including indexes and TOAST.",
	})
)

func init() {
	metrics.Registry.MustRegister(metricDigestWriteFailures, metricJournalRows, metricJournalBytes)
}
