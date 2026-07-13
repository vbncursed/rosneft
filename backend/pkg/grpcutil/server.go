// Package grpcutil centralizes gRPC server and client construction so every
// service in the backend speaks gRPC with the same keepalive parameters,
// message size limits, and interceptor chain (recovery + slog + request-id).
//
// Without these defaults, an idle TCP connection survives long enough for a
// load-balancer or container runtime to drop it silently, the next RPC fails
// only after the call timeout, and a panic in any handler crashes the whole
// server.
package grpcutil

import (
	"log/slog"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// MaxMessageSize is 16 MiB — large enough for the gateway's SceneBundle with
// dozens of placements + LOD chains. The gRPC default of 4 MiB is too tight.
const MaxMessageSize = 16 * 1024 * 1024

// ServerKeepalive instructs the server to ping idle clients every 30s and
// close the connection if no ack arrives within 10s. EnforcementPolicy.MinTime
// matches the client side so well-behaved clients are never disconnected.
var ServerKeepalive = keepalive.ServerParameters{
	Time:    30 * time.Second,
	Timeout: 10 * time.Second,
}

// ServerEnforcement caps how aggressively clients may ping. Permitting pings
// without a stream lets long-lived idle connections stay healthy.
var ServerEnforcement = keepalive.EnforcementPolicy{
	MinTime:             5 * time.Second,
	PermitWithoutStream: true,
}

// NewServer returns a *grpc.Server with the sane defaults applied. Pass
// additional grpc.ServerOption values when a service needs anything specific
// (e.g. TLS credentials); they are appended after the defaults so callers can
// override.
func NewServer(logger *slog.Logger, extra ...grpc.ServerOption) *grpc.Server {
	opts := []grpc.ServerOption{
		grpc.KeepaliveParams(ServerKeepalive),
		grpc.KeepaliveEnforcementPolicy(ServerEnforcement),
		grpc.MaxRecvMsgSize(MaxMessageSize),
		grpc.MaxSendMsgSize(MaxMessageSize),
		grpc.ChainUnaryInterceptor(
			RecoveryUnaryInterceptor(logger),
			metrics.UnaryServerInterceptor(),
			RequestIDUnaryInterceptor(),
			SlogUnaryInterceptor(logger),
		),
		grpc.ChainStreamInterceptor(
			RecoveryStreamInterceptor(logger),
			metrics.StreamServerInterceptor(),
			RequestIDStreamInterceptor(),
			SlogStreamInterceptor(logger),
		),
	}
	opts = append(opts, extra...)
	return grpc.NewServer(opts...)
}
