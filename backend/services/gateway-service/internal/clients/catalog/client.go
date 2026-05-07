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

// mapStatusErr translates remote NotFound into the local domain sentinel.
// notFoundErr is the domain error to wrap when the upstream returned NotFound.
func mapStatusErr(err error, notFoundErr error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return err
	}
	if st.Code() == codes.NotFound {
		return errors.Join(notFoundErr, err)
	}
	return err
}
