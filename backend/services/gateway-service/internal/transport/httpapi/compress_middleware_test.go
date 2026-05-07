package httpapi_test

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
)

type CompressMiddlewareSuite struct {
	suite.Suite
}

func TestCompressMiddlewareSuite(t *testing.T) {
	suite.Run(t, new(CompressMiddlewareSuite))
}

func (s *CompressMiddlewareSuite) TestBrotliPreferred() {
	h := httpapi.CompressionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hello":"world"}`))
	}))
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Accept-Encoding", "br, gzip")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	assert.Equal(s.T(), rr.Header().Get("Content-Encoding"), "br")

	body, err := io.ReadAll(brotli.NewReader(rr.Body))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(body), `{"hello":"world"}`)
}

func (s *CompressMiddlewareSuite) TestGzipFallback() {
	h := httpapi.CompressionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"a":1}`))
	}))
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	assert.Equal(s.T(), rr.Header().Get("Content-Encoding"), "gzip")

	dec, err := gzip.NewReader(rr.Body)
	assert.NilError(s.T(), err)
	body, err := io.ReadAll(dec)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(body), `{"a":1}`)
}

func (s *CompressMiddlewareSuite) TestSkipsNonCompressibleContentType() {
	h := httpapi.CompressionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte("BIN"))
	}))
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Accept-Encoding", "br")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	assert.Equal(s.T(), rr.Header().Get("Content-Encoding"), "")
	assert.Equal(s.T(), rr.Body.String(), "BIN")
}

func (s *CompressMiddlewareSuite) TestNoAcceptEncoding() {
	h := httpapi.CompressionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))
	assert.Equal(s.T(), rr.Header().Get("Content-Encoding"), "")
	assert.Equal(s.T(), rr.Body.String(), `{}`)
}
