package grpcutil

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"errors"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"
)

type LoggingSuite struct{ suite.Suite }

func TestLoggingSuite(t *testing.T) { suite.Run(t, new(LoggingSuite)) }

func (s *LoggingSuite) TestUnaryLevelsAndFields() {
	for _, tc := range []struct {
		code  codes.Code
		level string
	}{
		{codes.OK, "INFO"},
		{codes.NotFound, "INFO"},
		{codes.AlreadyExists, "INFO"},
		{codes.InvalidArgument, "INFO"},
		{codes.FailedPrecondition, "INFO"},
		{codes.OutOfRange, "INFO"},
		{codes.Canceled, "INFO"},
		{codes.Internal, "WARN"},
		{codes.Unavailable, "WARN"},
		{codes.DeadlineExceeded, "WARN"},
		{codes.Unknown, "WARN"},
	} {
		s.Run(tc.code.String(), func() {
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil))
			callErr := status.Error(tc.code, "failure")
			response, err := SlogUnaryInterceptor(
				logger,
			)(
				s.T().Context(),
				"request",
				&grpc.UnaryServerInfo{FullMethod: "/service/method"},
				func(_ context.Context, req any) (any, error) { return req, callErr },
			)
			assert.Equal(s.T(), response, any("request"))
			assert.Assert(s.T(), errors.Is(err, callErr))
			var entry map[string]any
			assert.NilError(s.T(), json.Unmarshal(output.Bytes(), &entry))
			assert.Equal(s.T(), entry["level"], any(tc.level))
			assert.Equal(s.T(), entry["msg"], any("grpc call"))
			assert.Equal(s.T(), entry["method"], any("/service/method"))
			assert.Equal(s.T(), entry["code"], any(tc.code.String()))
			_, hasDuration := entry["duration"]
			assert.Assert(s.T(), hasDuration)
			_, hasID := entry["request_id"]
			assert.Assert(s.T(), !hasID)
			if tc.level == "WARN" {
				assert.Equal(s.T(), entry["error"], any(callErr.Error()))
			} else {
				_, hasError := entry["error"]
				assert.Assert(s.T(), !hasError)
			}
		})
	}
}

func (s *LoggingSuite) TestRequestIDPropagation() {
	for _, tc := range []struct {
		name string
		md   metadata.MD
		want string
	}{
		{"no metadata", nil, ""},
		{"missing header", metadata.Pairs("other", "value"), ""},
		{"empty header", metadata.Pairs(RequestIDHeader, ""), ""},
		{"first header", metadata.Pairs(RequestIDHeader, "first", RequestIDHeader, "second"), "first"},
	} {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			if tc.md != nil {
				ctx = metadata.NewIncomingContext(ctx, tc.md)
			}
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil))
			info := &grpc.UnaryServerInfo{FullMethod: "/service/method"}
			var seen string
			_, err := RequestIDUnaryInterceptor()(ctx, nil, info, func(ctx context.Context, req any) (any, error) {
				return SlogUnaryInterceptor(logger)(ctx, req, info, func(ctx context.Context, _ any) (any, error) {
					seen = RequestIDFromContext(ctx)
					return nil, nil
				})
			})
			assert.NilError(s.T(), err)
			assert.Assert(s.T(), seen != "")
			if tc.want != "" {
				assert.Equal(s.T(), seen, tc.want)
			}
			var entry map[string]any
			assert.NilError(s.T(), json.Unmarshal(output.Bytes(), &entry))
			assert.Equal(s.T(), entry["request_id"], any(seen))
		})
	}
}

func (s *LoggingSuite) TestNilLoggerPreservesResult() {
	want := errors.New("handler error")
	response, err := SlogUnaryInterceptor(nil)(s.T().Context(), nil, &grpc.UnaryServerInfo{},
		func(context.Context, any) (any, error) { return "response", want })
	assert.Equal(s.T(), response, any("response"))
	assert.Assert(s.T(), errors.Is(err, want))
}

type loggingStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *loggingStream) Context() context.Context { return s.ctx }

func (s *LoggingSuite) TestStreamPropagatesIDAndLogs() {
	ctx := metadata.NewIncomingContext(s.T().Context(), metadata.Pairs(RequestIDHeader, "stream-id"))
	stream := &loggingStream{ctx: ctx}
	info := &grpc.StreamServerInfo{FullMethod: "/service/stream"}
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	want := status.Error(codes.Internal, "stream failed")
	err := RequestIDStreamInterceptor()(nil, stream, info, func(srv any, stream grpc.ServerStream) error {
		return SlogStreamInterceptor(logger)(srv, stream, info, func(_ any, stream grpc.ServerStream) error {
			assert.Equal(s.T(), RequestIDFromContext(stream.Context()), "stream-id")
			return want
		})
	})
	assert.Assert(s.T(), errors.Is(err, want))
	var entry map[string]any
	assert.NilError(s.T(), json.Unmarshal(output.Bytes(), &entry))
	assert.Equal(s.T(), entry["request_id"], any("stream-id"))
	assert.Equal(s.T(), entry["method"], any("/service/stream"))
	assert.Equal(s.T(), entry["level"], any("WARN"))
	assert.Equal(s.T(), entry["error"], any(want.Error()))
}
