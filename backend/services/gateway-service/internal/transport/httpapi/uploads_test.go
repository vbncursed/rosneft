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

type initiateStub struct{ Service }

func (initiateStub) InitiateUpload(_ context.Context, size int64, _ string) (domain.UploadSession, error) {
	return domain.UploadSession{ID: "u1", Size: size}, nil
}

// upload-service stores the normalised type, so the session echoes that value
// and not whatever the client sent.
func (s *UploadsSuite) TestInitiateEchoesTheNormalisedContentType() {
	tests := []struct{ name, sent, want string }{
		{"off the allow-list", "image/svg+xml", "application/octet-stream"},
		{"case and parameters", "Application/PDF; x=y", "application/pdf"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			resp, err := New(initiateStub{}).InitiateUpload(s.T().Context(), InitiateUploadRequestObject{
				Body: &InitiateUploadJSONRequestBody{Size: 1, ContentType: &tt.sent},
			})

			assert.NilError(s.T(), err)
			created, ok := resp.(InitiateUpload201JSONResponse)
			assert.Assert(s.T(), ok, "got %T", resp)
			assert.Assert(s.T(), created.ContentType != nil)
			assert.Equal(s.T(), *created.ContentType, tt.want)
		})
	}
}
