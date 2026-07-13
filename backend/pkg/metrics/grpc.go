package metrics

import (
	"context"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
)

var (
	grpcHandled = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "grpc_server_handled_total",
		Help: "Total gRPC calls completed, by service, method, and status code.",
	}, []string{"grpc_service", "grpc_method", "grpc_code"})

	grpcDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "grpc_server_handling_seconds",
		Help:    "Histogram of gRPC handler latency in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"grpc_service", "grpc_method"})
)

func init() { Registry.MustRegister(grpcHandled, grpcDuration) }

// splitMethod turns "/pkg.Service/Method" into ("pkg.Service", "Method").
func splitMethod(full string) (svc, method string) {
	full = strings.TrimPrefix(full, "/")
	if i := strings.LastIndex(full, "/"); i >= 0 {
		return full[:i], full[i+1:]
	}
	return "unknown", full
}

func record(fullMethod string, err error, start time.Time) {
	svc, method := splitMethod(fullMethod)
	grpcDuration.WithLabelValues(svc, method).Observe(time.Since(start).Seconds())
	grpcHandled.WithLabelValues(svc, method, status.Code(err).String()).Inc()
}

// UnaryServerInterceptor records RED metrics for every unary call.
func UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		record(info.FullMethod, err, start)
		return resp, err
	}
}

// StreamServerInterceptor records RED metrics for every streaming call.
func StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		start := time.Now()
		err := handler(srv, ss)
		record(info.FullMethod, err, start)
		return err
	}
}
