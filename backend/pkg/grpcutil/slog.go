package grpcutil

import (
	"context"
	"log/slog"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// SlogUnaryInterceptor logs every completed unary RPC at info, with the gRPC
// status code, duration, and request-id stitched together. Failed RPCs (non-OK
// status) are logged at warn or error depending on the code so on-call sees
// real failures and ignores routine "not found" responses.
func SlogUnaryInterceptor(logger *slog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		logRPC(ctx, logger, info.FullMethod, start, err)
		return resp, err
	}
}

// SlogStreamInterceptor logs every completed streaming RPC.
func SlogStreamInterceptor(logger *slog.Logger) grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		start := time.Now()
		err := handler(srv, ss)
		logRPC(ss.Context(), logger, info.FullMethod, start, err)
		return err
	}
}

func logRPC(ctx context.Context, logger *slog.Logger, method string, start time.Time, err error) {
	if logger == nil {
		return
	}
	code := status.Code(err)
	level := levelForCode(code)
	attrs := []slog.Attr{
		slog.String("method", method),
		slog.String("code", code.String()),
		slog.Duration("duration", time.Since(start)),
	}
	if id := RequestIDFromContext(ctx); id != "" {
		attrs = append(attrs, slog.String("request_id", id))
	}
	if err != nil && level >= slog.LevelWarn {
		attrs = append(attrs, slog.String("error", err.Error()))
	}
	logger.LogAttrs(ctx, level, "grpc call", attrs...)
}

// levelForCode maps gRPC codes to slog levels. Codes that signal client error
// (NotFound, InvalidArgument, AlreadyExists, FailedPrecondition) stay at info
// — those happen during normal operation and are noise in error dashboards.
// Codes that signal server error or upstream issue (Internal, Unavailable,
// DeadlineExceeded, Unknown) are logged at warn so they surface in alerts.
func levelForCode(code codes.Code) slog.Level {
	switch code {
	case codes.OK,
		codes.NotFound,
		codes.AlreadyExists,
		codes.InvalidArgument,
		codes.FailedPrecondition,
		codes.OutOfRange,
		codes.Canceled:
		return slog.LevelInfo
	default:
		return slog.LevelWarn
	}
}
