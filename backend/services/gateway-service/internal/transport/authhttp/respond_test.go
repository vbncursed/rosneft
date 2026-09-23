// In-package: fail is unexported.
package authhttp

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"
)

type RespondSuite struct{ suite.Suite }

func TestRespondSuite(t *testing.T) { suite.Run(t, new(RespondSuite)) }

// The body of a failed auth call hides what failed; the request's own log line
// — one line — keeps it.
func (s *RespondSuite) TestAServerFailureIsLoggedNotShown() {
	var logs bytes.Buffer
	h := chi.NewRouter()
	h.Use(slogchi.New(slog.New(slog.NewJSONHandler(&logs, nil))))
	h.Get("/api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		fail(w, r, status.Error(codes.Unavailable, "dial tcp 10.0.0.7:9004: connection refused"))
	})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodGet, "/api/auth/me", nil))

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), rec.Body.String(), `{"code":"internal","message":"internal error"}`+"\n")
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	assert.Equal(s.T(), len(lines), 1, logs.String())
	assert.Assert(s.T(), strings.Contains(lines[0], "connection refused"), lines[0])
}

// A refusal is the caller's business and keeps its words.
func (s *RespondSuite) TestARefusalKeepsItsMessage() {
	rec := httptest.NewRecorder()
	fail(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodGet, "/", nil),
		status.Error(codes.InvalidArgument, "password too short"))
	assert.Equal(s.T(), rec.Body.String(), `{"code":"invalid_input","message":"password too short"}`+"\n")
}
