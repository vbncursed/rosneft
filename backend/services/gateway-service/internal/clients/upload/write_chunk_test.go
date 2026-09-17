// In-package test: it builds Client around a bufconn connection.
package upload

import (
	"bytes"
	"context"
	"net"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// refusingServer ends every chunk stream on its first message, the way
// upload-service answers a session that is someone else's or gone.
type refusingServer struct {
	uploadv1.UnimplementedUploadServiceServer
}

func (refusingServer) WriteChunk(stream uploadv1.UploadService_WriteChunkServer) error {
	if _, err := stream.Recv(); err != nil {
		return err
	}
	return status.Error(codes.NotFound, "upload session not found")
}

type WriteChunkSuite struct{ suite.Suite }

func TestWriteChunkSuite(t *testing.T) { suite.Run(t, new(WriteChunkSuite)) }

func (s *WriteChunkSuite) client() *Client {
	lis := bufconn.Listen(1 << 20)
	srv := grpc.NewServer()
	uploadv1.RegisterUploadServiceServer(srv, refusingServer{})
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)
	conn, err := grpcutil.Dial("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })
	return &Client{conn: conn, cc: uploadv1.NewUploadServiceClient(conn)}
}

// A real chunk spans many stream messages. Once the server has closed the
// stream, Send reports only io.EOF; the refusal itself arrives through
// CloseAndRecv and must surface as not found (404), not as a send failure (500).
func (s *WriteChunkSuite) TestARefusalMidStreamIsNotFound() {
	for _, size := range []int{1000, 8 << 20} {
		_, err := s.client().WriteChunk(s.T().Context(), "abc", 0, bytes.NewReader(make([]byte, size)))
		assert.ErrorIs(s.T(), err, domain.ErrUploadNotFound, "body of %d bytes", size)
	}
}
