package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	httpHandled = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests, by method and response status code.",
	}, []string{"method", "code"})

	httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "Histogram of HTTP request latency in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method"})
)

func init() { Registry.MustRegister(httpHandled, httpDuration) }

// statusRecorder captures the response code. Unwrap + Flush keep SSE and large
// binary streaming working when this wraps the gateway/asset writer.
type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.code = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Middleware records RED metrics for every HTTP request. Labels are method +
// status only — the URL path is deliberately omitted to bound cardinality.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		httpDuration.WithLabelValues(r.Method).Observe(time.Since(start).Seconds())
		httpHandled.WithLabelValues(r.Method, strconv.Itoa(rec.code)).Inc()
	})
}
