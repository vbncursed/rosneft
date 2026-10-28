// Package grpcapi exposes passkey-service over gRPC. server.go holds the
// dependency interfaces, the Server, registration, and the central error mapper.
package grpcapi

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
)

// Service is the passkey business surface.
type Service interface {
	BeginRegistration(ctx context.Context, userID, displayName string) (string, string, error)
	FinishRegistration(ctx context.Context, userID, flowID, credentialJSON, name string) (domain.Credential, error)
	BeginLogin(ctx context.Context) (string, string, error)
	FinishLogin(ctx context.Context, flowID, assertionJSON string) (string, error)
	List(ctx context.Context, userID string) ([]domain.Credential, error)
	Delete(ctx context.Context, userID, credentialID string) error
	CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error)
}

// Server implements passkeyv1.PasskeyServiceServer.
type Server struct {
	passkeyv1.UnimplementedPasskeyServiceServer
	svc Service
}

// New builds the gRPC handler.
func New(svc Service) *Server { return &Server{svc: svc} }

// Register attaches the handler to a grpc.Server.
func (s *Server) Register(srv *grpc.Server) { passkeyv1.RegisterPasskeyServiceServer(srv, s) }

// requireField rejects a request that omits a field the gateway always fills
// from the session it authenticated; an empty one means a caller that skipped
// that step, and acting on it would touch the "" user.
func requireField(name, value string) error {
	if value == "" {
		return mapErr(fmt.Errorf("%w: %s is required", domain.ErrInvalidInput, name))
	}
	return nil
}

// mapErr converts domain sentinels to gRPC codes.
func mapErr(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, domain.ErrInvalidInput):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, domain.ErrCeremonyExpired):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, domain.ErrAssertionInvalid), errors.Is(err, domain.ErrNoCredentials):
		return status.Error(codes.Unauthenticated, err.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}
