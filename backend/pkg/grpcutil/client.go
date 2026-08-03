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

// retryServiceConfig applies to every method ("name":[{}]) on every client
// built by Dial.
//
// UNAVAILABLE and nothing else. gRPC does not retry an RPC once response
// headers have arrived, so a call that reached a handler and returned anything
// is never repeated — which is what makes this safe for mutations.
// DEADLINE_EXCEEDED is deliberately absent: it can mean the handler is still
// running, and a retry would be a second execution.
//
// retryThrottling stops a struggling backend from being hit with three times
// the traffic at the moment it is least able to take it.
const retryServiceConfig = `{
  "methodConfig": [{
    "name": [{}],
    "retryPolicy": {
      "MaxAttempts": 3,
      "InitialBackoff": "0.1s",
      "MaxBackoff": "1s",
      "BackoffMultiplier": 2,
      "RetryableStatusCodes": ["UNAVAILABLE"]
    }
  }],
  "retryThrottling": { "maxTokens": 10, "tokenRatio": 0.1 }
}`

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
		// Forwards the ctx actor as metadata so the next hop can attribute the
		// change it makes. A call with no actor on ctx is unaffected.
		grpc.WithChainUnaryInterceptor(ActorClientInterceptor()),
		grpc.WithDefaultServiceConfig(retryServiceConfig),
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
