// Package grpcapi exposes twofa-service over gRPC. One method per file; this
// file holds the dependency interfaces, the Server, registration, and the
// central error mapper.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
)

// Service is the twofa business surface.
type Service interface {
	Setup(ctx context.Context, userID, accountLabel string) (string, string, error)
	Enable(ctx context.Context, userID, code string) ([]string, error)
	Disable(ctx context.Context, userID, code string) error
	Regenerate(ctx context.Context, userID, code string) ([]string, error)
	IsEnabled(ctx context.Context, userID string) (bool, error)
	Verify(ctx context.Context, userID, code string) (bool, error)
}

// Identity resolves a session token to (userID, username).
type Identity interface {
	Resolve(ctx context.Context, token string) (userID, username string, err error)
}

// Server implements twofav1.TwoFAServiceServer.
type Server struct {
	twofav1.UnimplementedTwoFAServiceServer
	svc      Service
	identity Identity
}

// New builds the gRPC handler.
func New(svc Service, identity Identity) *Server {
	return &Server{svc: svc, identity: identity}
}

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { twofav1.RegisterTwoFAServiceServer(srv, s) }

// mapErr converts domain sentinels to gRPC status codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.Err2FAInvalidCode):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.Err2FALocked):
		return status.Error(codes.ResourceExhausted, err.Error())
	case errors.Is(err, domain.Err2FAAlreadyEnabled), errors.Is(err, domain.Err2FANotEnabled):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
