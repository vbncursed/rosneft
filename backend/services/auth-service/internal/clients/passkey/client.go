// Package passkey is auth-service's gRPC client for passkey-service.
package passkey

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// Client wraps the generated PasskeyServiceClient.
type Client struct {
	conn *grpc.ClientConn
	cc   passkeyv1.PasskeyServiceClient
}

// Dial opens a connection to the passkey service. Caller must Close.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: passkeyv1.NewPasskeyServiceClient(conn)}, nil
}

// Close releases the gRPC connection.
func (c *Client) Close() error { return c.conn.Close() }
