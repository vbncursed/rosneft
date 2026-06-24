package apperr_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

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

func TestToStatus(t *testing.T) {
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
		t.Run(tt.name, func(t *testing.T) {
			got := apperr.ToStatus(tt.err, table)
			if tt.err == nil {
				assert.NilError(t, got)
				return
			}
			assert.Equal(t, status.Code(got), tt.want)
		})
	}
}

func TestSlugAndHTTPStatus(t *testing.T) {
	assert.Equal(t, apperr.Slug(codes.NotFound), apperr.SlugNotFound)
	assert.Equal(t, apperr.Slug(codes.Internal), apperr.SlugInternal)
	assert.Equal(t, apperr.HTTPStatus(codes.InvalidArgument), http.StatusBadRequest)
	assert.Equal(t, apperr.HTTPStatus(codes.Unknown), http.StatusInternalServerError)
}

func TestWriteStatus(t *testing.T) {
	rec := httptest.NewRecorder()
	apperr.WriteStatus(rec, status.Error(codes.PermissionDenied, "nope"))
	assert.Equal(t, rec.Code, http.StatusForbidden)
	assert.Equal(t, rec.Header().Get("Content-Type"), "application/json")
	assert.Equal(t, rec.Body.String(), `{"code":"forbidden","message":"nope"}`+"\n")
}
