package grpcutil

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// Metadata keys carrying the human behind a request across service hops. They
// mirror the x-request-id convention so one propagation mechanism covers both,
// and they keep identity out of the .proto files entirely.
const (
	ActorIDHeader      = "x-actor-id"
	ActorCompanyHeader = "x-actor-company"
)

type actorKey struct{}

// Actor identifies who caused a mutation. Both fields are empty for background
// work (the mesh-worker reconciler, migrations) — such changes are still
// captured by the audit trigger, attributed to nobody rather than dropped.
type Actor struct {
	ID      string
	Company string
}

// WithActor stashes the actor on ctx so ActorClientInterceptor can forward it.
func WithActor(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, a)
}

// ActorFromContext returns the actor attached to ctx, zero-valued if none.
func ActorFromContext(ctx context.Context) Actor {
	a, _ := ctx.Value(actorKey{}).(Actor)
	return a
}

// ActorUnaryInterceptor lifts the actor from inbound metadata onto ctx so the
// storage layer can publish it into the mutation's transaction.
func ActorUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		return handler(withActorFromMetadata(ctx), req)
	}
}

// ActorStreamInterceptor is the streaming counterpart.
func ActorStreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, _ *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		wrapped := &serverStreamWithCtx{ServerStream: ss, ctx: withActorFromMetadata(ss.Context())}
		return handler(srv, wrapped)
	}
}

func withActorFromMetadata(ctx context.Context) context.Context {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ctx
	}
	a := Actor{ID: firstMD(md, ActorIDHeader), Company: firstMD(md, ActorCompanyHeader)}
	if a.ID == "" && a.Company == "" {
		return ctx
	}
	return WithActor(ctx, a)
}

func firstMD(md metadata.MD, key string) string {
	if v := md.Get(key); len(v) > 0 {
		return v[0]
	}
	return ""
}

// ActorClientInterceptor copies the ctx actor into outbound metadata. It is
// attached to every Dial by default; a call with no actor on ctx sends no extra
// headers, so background callers stay untouched.
func ActorClientInterceptor() grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context, method string, req, reply any,
		cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption,
	) error {
		if a := ActorFromContext(ctx); a.ID != "" {
			ctx = metadata.AppendToOutgoingContext(ctx,
				ActorIDHeader, a.ID,
				ActorCompanyHeader, a.Company,
			)
		}
		return invoker(ctx, method, req, reply, cc, opts...)
	}
}
