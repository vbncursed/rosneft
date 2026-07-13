package service

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

var (
	metricUploadBytes = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "upload_bytes_total",
		Help: "Total bytes committed by finalized uploads.",
	})
	metricUploads = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "uploads_total",
		Help: "Uploads finalized, by status (succeeded|failed).",
	}, []string{"status"})
)

func init() { metrics.Registry.MustRegister(metricUploadBytes, metricUploads) }
