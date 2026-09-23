package httpapi

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type InternalErrorSuite struct{ suite.Suite }

func TestInternalErrorSuite(t *testing.T) { suite.Run(t, new(InternalErrorSuite)) }

// A 500 tells the browser nothing about the failure, and the request's own log
// line tells the operator everything: one line, carrying the detail.
func (s *InternalErrorSuite) TestA500HidesItsDetailAndLogsItOnce() {
	var logs bytes.Buffer
	r := chi.NewRouter()
	r.Use(slogchi.New(slog.New(slog.NewJSONHandler(&logs, nil))))
	var slug string
	HandlerFromMux(NewStrictHandler(New(batchStub{
		slug: &slug, items: new([]domain.Placement), err: errors.New("catalog: dial tcp 10.0.0.7:9001: connection refused"),
	}), nil), r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodPost,
		"/api/territories/yard/placements/batch", strings.NewReader(`{"items":[{"modelSlug":"pump"}]}`)))

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), rec.Body.String(), `{"code":"internal","message":"internal error"}`+"\n")
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	assert.Equal(s.T(), len(lines), 1, logs.String())
	assert.Assert(s.T(), strings.Contains(lines[0], "connection refused"), lines[0])
}
