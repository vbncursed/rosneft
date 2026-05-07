package grpcutil

import (
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
)

// ClientKeepalive instructs the client to ping the server every 30s and close
// the connection if the ack does not arrive within 10s. PermitWithoutStream
// keeps the channel healthy across periods with no in-flight RPCs.
var ClientKeepalive = keepalive.ClientParameters{
	Time:                30 * time.Second,
	Timeout:             10 * time.Second,
	PermitWithoutStream: true,
}

// Dial opens a gRPC client connection to target with the standard backend
// defaults: insecure credentials (services run on a private Compose network),
// keepalive pings, and 16 MiB call message size limits.
//
// Pass additional grpc.DialOption values when callers need extras (e.g. TLS,
// custom interceptors); they are appended last so they can override defaults.
func Dial(target string, extra ...grpc.DialOption) (*grpc.ClientConn, error) {
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithKeepaliveParams(ClientKeepalive),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(MaxMessageSize),
			grpc.MaxCallSendMsgSize(MaxMessageSize),
		),
	}
	opts = append(opts, extra...)
	conn, err := grpc.NewClient(target, opts...)
	if err != nil {
		return nil, fmt.Errorf("grpcutil.Dial %q: %w", target, err)
	}
	return conn, nil
}
