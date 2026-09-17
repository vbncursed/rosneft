package grpcapi_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/transport/grpcapi"
)

const (
	alice = "0b1c2d3e-aaaa-bbbb-cccc-000000000001"
	bob   = "0b1c2d3e-aaaa-bbbb-cccc-000000000002"
)

// OwnershipSuite drives the real server over bufconn with the production
// interceptor chain on both ends, so the author travels exactly as it does
// from the gateway: x-actor-id metadata, unary and streaming.
type OwnershipSuite struct {
	suite.Suite
	cc uploadv1.UploadServiceClient
}

func TestOwnershipSuite(t *testing.T) { suite.Run(t, new(OwnershipSuite)) }

func (s *OwnershipSuite) SetupTest() {
	store, err := storage.NewFS(s.T().TempDir())
	assert.NilError(s.T(), err)
	blobs, err := blobstore.NewFS(s.T().TempDir())
	assert.NilError(s.T(), err)

	lis := bufconn.Listen(1 << 20)
	srv := grpcutil.NewServer(slog.New(slog.DiscardHandler))
	grpcapi.New(service.New(service.Config{Store: store, Blobs: blobs})).Register(srv)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	conn, err := grpcutil.Dial("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })
	s.cc = uploadv1.NewUploadServiceClient(conn)
}

func (s *OwnershipSuite) as(user string) context.Context {
	return grpcutil.WithActor(s.T().Context(), grpcutil.Actor{ID: user})
}

func (s *OwnershipSuite) initiate(user string, size int64) string {
	resp, err := s.cc.Initiate(s.as(user), &uploadv1.InitiateRequest{Size: size})
	assert.NilError(s.T(), err)
	return resp.GetUploadId()
}

// write streams data in 64 KB messages, as the gateway does, and returns the
// stream's status. A refused stream is closed by the server after its first
// message: Send then says only io.EOF, which is a signal to stop sending, not
// the answer — the answer is what CloseAndRecv returns.
func (s *OwnershipSuite) write(user, id string, data []byte) error {
	stream, err := s.cc.WriteChunk(s.as(user))
	assert.NilError(s.T(), err)
	const message = 64 << 10
	for off := 0; off < len(data); off += message {
		end := min(off+message, len(data))
		err := stream.Send(&uploadv1.WriteChunkRequest{UploadId: id, Offset: int64(off), Data: data[off:end]})
		if errors.Is(err, io.EOF) {
			break
		}
		assert.NilError(s.T(), err)
	}
	_, err = stream.CloseAndRecv()
	return err
}

func (s *OwnershipSuite) TestInitiateNeedsAnAuthor() {
	_, err := s.cc.Initiate(s.T().Context(), &uploadv1.InitiateRequest{Size: 1})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *OwnershipSuite) TestAnotherUserCannotTouchTheSession() {
	id := s.initiate(alice, 3)

	assert.Equal(s.T(), status.Code(s.write(bob, id, []byte("abc"))), codes.NotFound)
	// A real chunk: many messages, the server gives up after the first.
	assert.Equal(s.T(), status.Code(s.write(bob, id, make([]byte, 8<<20))), codes.NotFound)
	_, err := s.cc.GetStatus(s.as(bob), &uploadv1.GetStatusRequest{UploadId: id})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	_, err = s.cc.Abort(s.as(bob), &uploadv1.AbortRequest{UploadId: id})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)

	assert.NilError(s.T(), s.write(alice, id, []byte("abc")))
	_, err = s.cc.Finalize(s.as(bob), &uploadv1.FinalizeRequest{UploadId: id})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)

	st, err := s.cc.GetStatus(s.as(alice), &uploadv1.GetStatusRequest{UploadId: id})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), st.GetOffset(), int64(3), "the stranger's calls changed nothing")
}

func (s *OwnershipSuite) TestOnlyTheAuthorHasUploadedTheHash() {
	id := s.initiate(alice, 3)
	assert.NilError(s.T(), s.write(alice, id, []byte("abc")))
	fin, err := s.cc.Finalize(s.as(alice), &uploadv1.FinalizeRequest{UploadId: id})
	assert.NilError(s.T(), err)

	mine, err := s.cc.HasUploaded(s.as(alice), &uploadv1.HasUploadedRequest{BlobHash: fin.GetBlobHash()})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), mine.GetUploaded())

	theirs, err := s.cc.HasUploaded(s.as(bob), &uploadv1.HasUploadedRequest{BlobHash: fin.GetBlobHash()})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !theirs.GetUploaded())
}

// The hash comes from a request body; a malformed one is the caller's mistake.
func (s *OwnershipSuite) TestMalformedHashIsInvalid() {
	_, err := s.cc.HasUploaded(s.as(alice), &uploadv1.HasUploadedRequest{BlobHash: "../etc"})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

// Aborting a session that is already gone stays idempotent.
func (s *OwnershipSuite) TestAbortOfAMissingSessionSucceeds() {
	_, err := s.cc.Abort(s.as(alice), &uploadv1.AbortRequest{UploadId: "abcdef"})
	assert.NilError(s.T(), err)
}
