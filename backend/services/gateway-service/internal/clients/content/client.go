// Package content is the gRPC client for the content service. The client
// converts protobuf wire types into gateway domain types at the boundary,
// so the rest of the gateway never sees pb.
package content

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
)

// Client wraps the content gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   contentv1.ContentServiceClient
}

// Dial opens a connection to the content service. The caller must Close it.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: contentv1.NewContentServiceClient(conn)}, nil
}

// Close releases the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
