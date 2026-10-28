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
	Status(ctx context.Context, userID string) (domain.Status, error)
	IsEnabled(ctx context.Context, userID string) (bool, error)
	EnabledFor(ctx context.Context, userIDs []string) ([]string, error)
	Verify(ctx context.Context, userID, code string) (bool, error)
}

// Server implements twofav1.TwoFAServiceServer.
type Server struct {
	twofav1.UnimplementedTwoFAServiceServer
	svc Service
}

// New builds the gRPC handler.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { twofav1.RegisterTwoFAServiceServer(srv, s) }

// mapErr converts domain sentinels to gRPC status codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrInvalidInput), errors.Is(err, domain.ErrTwoFAInvalidCode):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrTwoFALocked):
		return status.Error(codes.ResourceExhausted, err.Error())
	case errors.Is(err, domain.ErrTwoFAAlreadyEnabled), errors.Is(err, domain.ErrTwoFANotEnabled):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
