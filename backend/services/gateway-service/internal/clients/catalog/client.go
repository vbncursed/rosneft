// Package catalog is the gRPC client for the catalog service. The client
// converts protobuf wire types into gateway domain types at the boundary,
// so the rest of the gateway never sees pb.
package catalog

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
)

// Client wraps the catalog gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   catalogv1.CatalogServiceClient
}

// Dial opens a connection to the catalog service. The caller must Close it.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: catalogv1.NewCatalogServiceClient(conn)}, nil
}

// Close releases the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
