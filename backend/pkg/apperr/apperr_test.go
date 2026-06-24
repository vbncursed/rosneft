package apperr_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

var (
	errNotFound = errors.New("thing not found")
	errBadInput = errors.New("bad input")
)

var table = map[codes.Code][]error{
	codes.InvalidArgument: {errBadInput},
	codes.NotFound:        {errNotFound},
}

type AppErrSuite struct {
	suite.Suite
}

func TestAppErrSuite(t *testing.T) {
	suite.Run(t, new(AppErrSuite))
}

func (s *AppErrSuite) TestToStatus() {
	tests := []struct {
		name string
		err  error
		want codes.Code
	}{
		{"nil stays nil", nil, codes.OK},
		{"matched not found", errNotFound, codes.NotFound},
		{"matched invalid", errBadInput, codes.InvalidArgument},
		{"wrapped sentinel matches", errors.Join(errNotFound, errors.New("ctx")), codes.NotFound},
		{"unmatched becomes internal", errors.New("boom"), codes.Internal},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			got := apperr.ToStatus(tt.err, table)
			if tt.err == nil {
				assert.NilError(s.T(), got)
				return
			}
			assert.Equal(s.T(), status.Code(got), tt.want)
		})
	}
}

func (s *AppErrSuite) TestSlugAndHTTPStatus() {
	assert.Equal(s.T(), apperr.Slug(codes.NotFound), apperr.SlugNotFound)
	assert.Equal(s.T(), apperr.Slug(codes.Internal), apperr.SlugInternal)
	assert.Equal(s.T(), apperr.HTTPStatus(codes.InvalidArgument), http.StatusBadRequest)
	assert.Equal(s.T(), apperr.HTTPStatus(codes.Unknown), http.StatusInternalServerError)
}

func (s *AppErrSuite) TestWriteStatus() {
	rec := httptest.NewRecorder()
	apperr.WriteStatus(rec, status.Error(codes.PermissionDenied, "nope"))
	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
	assert.Equal(s.T(), rec.Body.String(), `{"code":"forbidden","message":"nope"}`+"\n")
}
