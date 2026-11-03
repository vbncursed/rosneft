package apperr_test

import (
	"errors"
	"fmt"
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

func (s *AppErrSuite) TestErrorContract() {
	tests := []struct {
		name       string
		grpcCode   codes.Code
		slug       string
		httpStatus int
		message    string
	}{
		{"invalid argument", codes.InvalidArgument, "invalid_input", http.StatusBadRequest, "request detail"},
		{"unauthenticated", codes.Unauthenticated, "unauthenticated", http.StatusUnauthorized, "request detail"},
		{"permission denied", codes.PermissionDenied, "forbidden", http.StatusForbidden, "request detail"},
		{"not found", codes.NotFound, "not_found", http.StatusNotFound, "request detail"},
		{"already exists", codes.AlreadyExists, "conflict", http.StatusConflict, "request detail"},
		{
			"failed precondition",
			codes.FailedPrecondition,
			"unprocessable",
			http.StatusUnprocessableEntity,
			"request detail",
		},
		{"internal", codes.Internal, "internal", http.StatusInternalServerError, "internal error"},
		{"unavailable", codes.Unavailable, "internal", http.StatusInternalServerError, "internal error"},
		{"unknown code", codes.Code(999), "internal", http.StatusInternalServerError, "internal error"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			assert.Equal(s.T(), apperr.Slug(tt.grpcCode), tt.slug)
			assert.Equal(s.T(), apperr.HTTPStatus(tt.grpcCode), tt.httpStatus)

			rec := httptest.NewRecorder()
			apperr.WriteStatus(rec, status.Error(tt.grpcCode, "request detail"))
			assert.Equal(s.T(), rec.Code, tt.httpStatus)
			assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
			assert.Equal(s.T(), rec.Body.String(), fmt.Sprintf(`{"code":%q,"message":%q}`+"\n", tt.slug, tt.message))
		})
	}
}

func (s *AppErrSuite) TestWriteStatus() {
	rec := httptest.NewRecorder()
	apperr.WriteStatus(rec, status.Error(codes.PermissionDenied, "nope"))
	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
	assert.Equal(s.T(), rec.Body.String(), `{"code":"forbidden","message":"nope"}`+"\n")
}

// A 5xx never carries the status text: it names hosts, SQL and call paths.
func (s *AppErrSuite) TestWriteStatusHidesAServerErrorsText() {
	for _, c := range []codes.Code{codes.Internal, codes.Unavailable, codes.Unknown} {
		rec := httptest.NewRecorder()
		apperr.WriteStatus(rec, status.Error(c, "dial tcp 10.0.0.7:9004: connection refused"))
		assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
		assert.Equal(s.T(), rec.Body.String(), `{"code":"internal","message":"internal error"}`+"\n")
	}
}

// A refusal's message starts at its sentinel: the gateway shows it to the
// browser, so the layers' "service.X:" prefixes stay behind. Internal keeps
// its whole text for the gateway's log.
func (s *AppErrSuite) TestToStatusAtSentinel() {
	tests := []struct {
		name string
		err  error
		code codes.Code
		msg  string
	}{
		{
			name: "wrapped refusal",
			err:  fmt.Errorf("users.Create: %w", fmt.Errorf("%w: password too short", errBadInput)),
			code: codes.InvalidArgument,
			msg:  "bad input: password too short",
		},
		{name: "bare sentinel", err: errNotFound, code: codes.NotFound, msg: "thing not found"},
		{
			name: "internal keeps its detail", err: fmt.Errorf("store.Get: %w", errors.New("conn reset")),
			code: codes.Internal, msg: "internal: store.Get: conn reset",
		},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			st := status.Convert(apperr.ToStatusAtSentinel(tt.err, table))
			assert.Equal(s.T(), st.Code(), tt.code)
			assert.Equal(s.T(), st.Message(), tt.msg)
		})
	}
	assert.NilError(s.T(), apperr.ToStatusAtSentinel(nil, table))
}
