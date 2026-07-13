package worker

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

var (
	metricConversions = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "mesh_conversions_total",
		Help: "Mesh conversions completed, by status (succeeded|failed).",
	}, []string{"status"})

	metricConversionSeconds = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "mesh_conversion_duration_seconds",
		Help:    "Wall-clock duration of a single mesh conversion.",
		Buckets: []float64{1, 5, 15, 30, 60, 120, 300, 600},
	})

	metricQueueDepth = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "mesh_queue_depth",
		// Jobs delivered on the last consume batch. ConsumeJobs caps a batch at
		// 16, so a sustained value of 16 means the worker keeps pulling full
		// batches — i.e. the stream has a backlog it cannot drain.
		Help: "Jobs in the last consume batch (0-16; sustained 16 signals backlog).",
	})
)

func init() {
	metrics.Registry.MustRegister(metricConversions, metricConversionSeconds, metricQueueDepth)
}
