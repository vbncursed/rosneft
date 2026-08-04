// Package twofa is the gateway's gRPC client for twofa-service.
package twofa

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	twofav1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/twofa/v1"
)

// Client wraps the generated TwoFAServiceClient.
type Client struct {
	conn *grpc.ClientConn
	cc   twofav1.TwoFAServiceClient
}

// Dial opens a connection to the twofa service. Caller must Close.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, cc: twofav1.NewTwoFAServiceClient(conn)}, nil
}

// Close releases the gRPC connection.
func (c *Client) Close() error { return c.conn.Close() }

// Conn exposes the underlying connection so the gateway can register a
// readiness probe against this backend. It is not for making calls — the
// typed methods on Client are.
func (c *Client) Conn() grpc.ClientConnInterface { return c.conn }
