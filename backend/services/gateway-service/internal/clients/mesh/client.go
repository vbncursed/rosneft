// Package mesh is the gRPC client for the mesh service. Translates pb wire
// types to gateway domain at the boundary.
package mesh

import (
	"errors"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
)

// Client wraps the mesh gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   meshv1.MeshServiceClient
}

// Dial opens a connection to the mesh service.
func Dial(target string) (*Client, error) {
	conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("mesh.Dial: %w", err)
	}
	return &Client{conn: conn, cc: meshv1.NewMeshServiceClient(conn)}, nil
}

// Close releases the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

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
