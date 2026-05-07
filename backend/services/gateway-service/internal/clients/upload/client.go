// Package upload is the gRPC client for the upload service. The gateway
// terminates the public REST chunked-upload protocol and translates each
// operation into one of these methods.
package upload

import (
	"errors"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

// Client wraps the upload gRPC stub.
type Client struct {
	conn *grpc.ClientConn
	cc   uploadv1.UploadServiceClient
}

// Dial opens a connection to the upload service.
func Dial(target string) (*Client, error) {
	conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("upload.Dial: %w", err)
	}
	return &Client{conn: conn, cc: uploadv1.NewUploadServiceClient(conn)}, nil
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
	switch st.Code() {
	case codes.NotFound:
		return errors.Join(notFoundErr, err)
	case codes.InvalidArgument:
		return err
	default:
		return err
	}
}
