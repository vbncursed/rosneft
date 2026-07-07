// Package auth is passkey-service's gRPC client for auth-service (identity only).
package auth

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// Client wraps the generated AuthServiceClient.
type Client struct {
	conn *grpc.ClientConn
	cc   authv1.AuthServiceClient
}

// Dial opens a connection to the auth service. Caller must Close.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: authv1.NewAuthServiceClient(conn)}, nil
}

// Close releases the gRPC connection.
func (c *Client) Close() error { return c.conn.Close() }
