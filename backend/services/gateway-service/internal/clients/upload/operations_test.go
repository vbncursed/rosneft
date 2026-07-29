// In-package test: it substitutes the unexported gRPC stub on Client.
package upload

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// stubCC fails every call with a fixed status. Hand-written rather than
// minimock-generated: the interface belongs to the generated proto package,
// which carries no //go:generate directive of ours.
type stubCC struct {
	uploadv1.UploadServiceClient
	err error
}

func (s stubCC) Initiate(
	context.Context, *uploadv1.InitiateRequest, ...grpc.CallOption,
) (*uploadv1.InitiateResponse, error) {
	return nil, s.err
}

type OperationsSuite struct{ suite.Suite }

func TestOperationsSuite(t *testing.T) { suite.Run(t, new(OperationsSuite)) }

// upload-service caps the size (initiate.go: "size %d exceeds max %d") and the
// gateway does not know that cap — it only rejects size <= 0. So this rejection
// is reachable by anyone with a large enough file, and without MapStatus the
// bare gRPC status reached isInvalid(), missed the gateway's own sentinel, and
// the user got a 500 instead of a 400 saying the file is too big.
func (s *OperationsSuite) TestOversizeRejectionArrivesAsInvalidInput() {
	c := &Client{cc: stubCC{err: status.Error(codes.InvalidArgument, "size 999 exceeds max 100")}}

	_, err := c.Initiate(s.T().Context(), 999, "application/zip")

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// An unreachable upload-service must not be reported as the caller's mistake.
func (s *OperationsSuite) TestOtherCodesAreNotInvalidInput() {
	c := &Client{cc: stubCC{err: status.Error(codes.Unavailable, "upload service is down")}}

	_, err := c.Initiate(s.T().Context(), 1, "application/zip")

	assert.Assert(s.T(), err != nil)
	assert.Assert(s.T(), !errors.Is(err, domain.ErrInvalidInput))
}
