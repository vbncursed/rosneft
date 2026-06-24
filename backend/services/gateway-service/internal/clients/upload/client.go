// Package upload is the gRPC client for the upload service. The gateway
// terminates the public REST chunked-upload protocol and translates each
// operation into one of these methods.
package upload

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

// Client wraps the upload gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   uploadv1.UploadServiceClient
}

// Dial opens a connection to the upload service.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: uploadv1.NewUploadServiceClient(conn)}, nil
}

// Close releases the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
