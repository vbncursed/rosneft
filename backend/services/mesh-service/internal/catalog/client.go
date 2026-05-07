// Package catalog is a thin gRPC client for the catalog service. mesh-worker
// uses it to fetch project metadata before conversion and register the
// resulting artifact afterwards. One method per file — this file holds the
// connection wrapper and the proto<->domain converters.
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

// Client is a wrapper over the catalog gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   catalogv1.CatalogServiceClient
}

// Dial opens a connection to the catalog service.
// The caller must call Close on the returned client.
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

// mapStatusErr translates remote gRPC NotFound into a local domain sentinel.
// notFoundErr is the domain error to wrap when the upstream returned NotFound,
// so callers can express "this lookup means project-not-found" or
// "artifact-not-found" without leaking gRPC types.
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
