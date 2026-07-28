// Package audit is the gateway's client for the audit service.
package audit

import (
	"fmt"

	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
)

// Client wraps the AuditService gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   auditv1.AuditServiceClient
}

// Dial opens a connection to the audit service.
func Dial(target string) (*Client, error) {
	conn, err := grpcutil.Dial(target)
	if err != nil {
		return nil, fmt.Errorf("audit.Dial: %w", err)
	}
	return &Client{conn: conn, cc: auditv1.NewAuditServiceClient(conn)}, nil
}

// Close releases the connection.
func (c *Client) Close() error { return c.conn.Close() }
