package grpcutil

import (
	"context"
	"crypto/rand"
	"encoding/hex"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// RequestIDHeader is the metadata key used for cross-service request
// correlation. It mirrors the common HTTP convention so the gateway can
// propagate the same value end-to-end.
const RequestIDHeader = "x-request-id"

type requestIDKey struct{}

// RequestIDFromContext returns the request ID stashed by the interceptor, or
// "" if none was attached.
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// RequestIDUnaryInterceptor extracts an inbound request ID from gRPC metadata
// or generates a new one, then stores it on ctx so handlers (and downstream
// loggers) can include it.
func RequestIDUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		return handler(withRequestID(ctx), req)
	}
}

// RequestIDStreamInterceptor is the streaming counterpart.
func RequestIDStreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, _ *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		wrapped := &serverStreamWithCtx{ServerStream: ss, ctx: withRequestID(ss.Context())}
		return handler(srv, wrapped)
	}
}

func withRequestID(ctx context.Context) context.Context {
	id := requestIDFromMetadata(ctx)
	if id == "" {
		id = newRequestID()
	}
	return context.WithValue(ctx, requestIDKey{}, id)
}

func requestIDFromMetadata(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	values := md.Get(RequestIDHeader)
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func newRequestID() string {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return ""
	}
	return hex.EncodeToString(buf[:])
}

// serverStreamWithCtx overrides Context() so handlers in the chain see the
// request-id we attached. Wrapping is the standard way to carry context
// values through a streaming RPC.
type serverStreamWithCtx struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *serverStreamWithCtx) Context() context.Context { return s.ctx }
