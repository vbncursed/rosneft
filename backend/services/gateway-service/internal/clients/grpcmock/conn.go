package grpcmock

import (
	"context"

	"google.golang.org/grpc"
)

//go:generate minimock -i Conn -o conn_mock.go -n ClientConnInterfaceMock -p grpcmock -g

type Conn interface {
	Invoke(context.Context, string, any, any, ...grpc.CallOption) error
	NewStream(context.Context, *grpc.StreamDesc, string, ...grpc.CallOption) (grpc.ClientStream, error)
}
