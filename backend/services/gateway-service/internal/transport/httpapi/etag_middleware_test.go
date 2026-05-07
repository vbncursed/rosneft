package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

type ETagMiddlewareSuite struct {
	suite.Suite
}

func TestETagMiddlewareSuite(t *testing.T) {
	suite.Run(t, new(ETagMiddlewareSuite))
}

func (s *ETagMiddlewareSuite) TestSetsETagOn200() {
	h := httpapi.ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))
	assert.Equal(s.T(), rr.Code, http.StatusOK)
	assert.Assert(s.T(), rr.Header().Get("ETag") != "")
}

func (s *ETagMiddlewareSuite) TestReturns304OnIfNoneMatch() {
	h := httpapi.ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	rr1 := httptest.NewRecorder()
	h.ServeHTTP(rr1, httptest.NewRequest(http.MethodGet, "/x", nil))
	etag := rr1.Header().Get("ETag")

	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("If-None-Match", etag)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, r)
	assert.Equal(s.T(), rr2.Code, http.StatusNotModified)
	assert.Equal(s.T(), rr2.Body.Len(), 0)
}

func (s *ETagMiddlewareSuite) TestSkipsNonGet() {
	h := httpapi.ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/x", nil))
	assert.Equal(s.T(), rr.Header().Get("ETag"), "")
}

func (s *ETagMiddlewareSuite) TestSkipsErrorStatus() {
	h := httpapi.ETagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))
	assert.Equal(s.T(), rr.Header().Get("ETag"), "")
	assert.Equal(s.T(), rr.Code, http.StatusInternalServerError)
}
