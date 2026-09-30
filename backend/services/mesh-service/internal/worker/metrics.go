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
		// The consumer group's lag, read every loop turn: the worker takes one
		// message per slot, so what it delivered says nothing about the queue.
		Help: "Conversion jobs queued and not yet delivered to a worker.",
	})
)

func init() {
	metrics.Registry.MustRegister(metricConversions, metricConversionSeconds, metricQueueDepth)
}
