package metrics

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestUnaryServerInterceptorRecordsCode(t *testing.T) {
	interceptor := UnaryServerInterceptor()
	info := &grpc.UnaryServerInfo{FullMethod: "/pkg.Svc/Do"}

	_, _ = interceptor(context.Background(), nil, info,
		func(ctx context.Context, req any) (any, error) { return "ok", nil })
	_, _ = interceptor(context.Background(), nil, info,
		func(ctx context.Context, req any) (any, error) { return nil, status.Error(codes.NotFound, "nope") })

	if got := testutil.ToFloat64(grpcHandled.WithLabelValues("pkg.Svc", "Do", "OK")); got != 1 {
		t.Fatalf("OK count = %v, want 1", got)
	}
	if got := testutil.ToFloat64(grpcHandled.WithLabelValues("pkg.Svc", "Do", "NotFound")); got != 1 {
		t.Fatalf("NotFound count = %v, want 1", got)
	}
}
