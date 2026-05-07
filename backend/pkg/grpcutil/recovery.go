package grpcutil

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// RecoveryUnaryInterceptor turns a panicked handler into a codes.Internal
// error so the rest of the server keeps running. The panic value and stack
// trace are logged once at error level.
func RecoveryUnaryInterceptor(logger *slog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				logPanic(ctx, logger, info.FullMethod, r)
				err = status.Errorf(codes.Internal, "internal error")
			}
		}()
		return handler(ctx, req)
	}
}

// RecoveryStreamInterceptor is the streaming counterpart to
// RecoveryUnaryInterceptor.
func RecoveryStreamInterceptor(logger *slog.Logger) grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) (err error) {
		defer func() {
			if r := recover(); r != nil {
				logPanic(ss.Context(), logger, info.FullMethod, r)
				err = status.Errorf(codes.Internal, "internal error")
			}
		}()
		return handler(srv, ss)
	}
}

func logPanic(ctx context.Context, logger *slog.Logger, method string, r any) {
	if logger == nil {
		return
	}
	logger.LogAttrs(ctx, slog.LevelError, "grpc handler panic",
		slog.String("method", method),
		slog.String("panic", fmt.Sprint(r)),
		slog.String("stack", string(debug.Stack())),
	)
}
