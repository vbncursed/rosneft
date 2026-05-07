// Package catalog is the gRPC client for the catalog service. The client
// converts protobuf wire types into gateway domain types at the boundary,
// so the rest of the gateway never sees pb.
package catalog

import (
	"errors"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Client wraps the catalog gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   catalogv1.CatalogServiceClient
}

// Dial opens a connection to the catalog service. The caller must Close it.
func Dial(target string) (*Client, error) {
	conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("catalog.Dial: %w", err)
	}
	return &Client{conn: conn, cc: catalogv1.NewCatalogServiceClient(conn)}, nil
}

// Close releases the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// mapStatusErr translates remote gRPC status codes into local domain
// sentinels. NotFound becomes notFoundErr (caller-supplied so the
// returned sentinel matches the operation: territory / model /
// placement / artifact). InvalidArgument becomes ErrInvalidInput so
// the gateway httpapi layer can surface it as 400 Bad Request rather
// than swallowing it as a generic 500. Anything else passes through
// untouched.
func mapStatusErr(err error, notFoundErr error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	switch st.Code() {
	case codes.NotFound:
		return errors.Join(notFoundErr, err)
	case codes.InvalidArgument:
		return errors.Join(domain.ErrInvalidInput, err)
	default:
		return err
	}
}
