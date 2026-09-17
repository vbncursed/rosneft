package httpapi

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type UploadsSuite struct{ suite.Suite }

func TestUploadsSuite(t *testing.T) { suite.Run(t, new(UploadsSuite)) }

type abortStub struct {
	Service
	err error
}

func (a abortStub) AbortUpload(context.Context, string) error { return a.err }

// upload-service answers NOT_FOUND for another user's session (H-2); that is
// a 404 like HEAD/PATCH/finalize give, not a 500.
func (s *UploadsSuite) TestAbortOfAnotherUsersSessionIs404() {
	srv := New(abortStub{err: errors.Join(domain.ErrUploadNotFound, errors.New("rpc error"))})
	resp, err := srv.AbortUpload(s.T().Context(), AbortUploadRequestObject{Id: "abc"})
	assert.NilError(s.T(), err)
	_, is404 := resp.(AbortUpload404JSONResponse)
	assert.Assert(s.T(), is404, "got %T", resp)
}

func (s *UploadsSuite) TestAbortSucceedsWith204() {
	resp, err := New(abortStub{}).AbortUpload(s.T().Context(), AbortUploadRequestObject{Id: "abc"})
	assert.NilError(s.T(), err)
	_, is204 := resp.(AbortUpload204Response)
	assert.Assert(s.T(), is204, "got %T", resp)
}
