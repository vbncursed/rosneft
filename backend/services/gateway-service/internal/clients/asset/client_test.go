package asset

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type ClientSuite struct {
	suite.Suite
	blob     []byte
	gotRange string
	gotPath  string
}

func TestClientSuite(t *testing.T) { suite.Run(t, new(ClientSuite)) }

func (s *ClientSuite) SetupTest() {
	s.blob = bytes.Repeat([]byte("0123456789"), 5)
	s.gotRange, s.gotPath = "", ""
}

// serve is asset-service's serveAsset: http.ServeContent over a seekable blob.
func (s *ClientSuite) serve() *Client {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.gotRange, s.gotPath = r.Header.Get("Range"), r.URL.Path
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(s.blob))
	}))
	s.T().Cleanup(srv.Close)
	return s.client(srv.URL)
}

func (s *ClientSuite) client(base string) *Client {
	c, err := New(base)
	assert.NilError(s.T(), err)
	return c
}

func (s *ClientSuite) TestOpenFromOffset() {
	c := s.serve()

	rc, err := c.Open(s.T().Context(), "h", 10)

	assert.NilError(s.T(), err)
	defer func() { _ = rc.Close() }()
	body, err := io.ReadAll(rc)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), body, s.blob[10:])
	assert.Equal(s.T(), s.gotRange, "bytes=10-")
	assert.Equal(s.T(), s.gotPath, "/assets/h")
}

func (s *ClientSuite) TestRangeIgnoredIsAnError() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(s.blob) // 200 whatever was asked
	}))
	s.T().Cleanup(srv.Close)

	rc, err := s.client(srv.URL).Open(s.T().Context(), "h", 10)

	assert.ErrorIs(s.T(), err, ErrRangeIgnored)
	assert.Assert(s.T(), rc == nil)
}

func (s *ClientSuite) TestMissingBlob() {
	srv := httptest.NewServer(http.NotFoundHandler())
	s.T().Cleanup(srv.Close)

	_, err := s.client(srv.URL).Open(s.T().Context(), "h", 0)

	assert.ErrorContains(s.T(), err, "404")
}

func (s *ClientSuite) TestEscapesTheHash() {
	c := s.serve()

	rc, err := c.Open(s.T().Context(), "a/b?c", 0)

	assert.NilError(s.T(), err)
	_ = rc.Close()
	assert.Equal(s.T(), s.gotPath, "/assets/a/b?c")
}

func (s *ClientSuite) TestNewRejectsBadURL() {
	for _, in := range []string{"asset:8081", ""} {
		s.Run(in, func() {
			_, err := New(in)
			assert.Assert(s.T(), err != nil)
		})
	}
}

func (s *ClientSuite) TestWrongContentRangeIsAnError() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Range", "bytes 0-49/50") // 206, but from the start
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write(s.blob)
	}))
	s.T().Cleanup(srv.Close)

	rc, err := s.client(srv.URL).Open(s.T().Context(), "h", 10)

	assert.ErrorIs(s.T(), err, ErrRangeIgnored)
	assert.Assert(s.T(), rc == nil)
}

func (s *ClientSuite) TestDoesNotFollowRedirects() {
	var elsewhere atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { elsewhere.Store(true) }))
	s.T().Cleanup(other.Close)
	srv := httptest.NewServer(http.RedirectHandler(other.URL+"/assets/h", http.StatusFound))
	s.T().Cleanup(srv.Close)

	_, err := s.client(srv.URL).Open(s.T().Context(), "h", 0)

	assert.ErrorContains(s.T(), err, "302")
	assert.Assert(s.T(), !elsewhere.Load())
}

func (s *ClientSuite) TestStalledBodyEndsWithTheContext() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Range", "bytes 0-49/50")
		w.WriteHeader(http.StatusPartialContent)
		w.(http.Flusher).Flush()
		<-r.Context().Done() // headers sent, body never comes
	}))
	s.T().Cleanup(srv.Close)
	ctx, cancel := context.WithCancel(s.T().Context())

	rc, err := s.client(srv.URL).Open(ctx, "h", 0)
	assert.NilError(s.T(), err)
	defer func() { _ = rc.Close() }()
	time.AfterFunc(10*time.Millisecond, cancel)
	_, err = io.ReadAll(rc)

	assert.ErrorIs(s.T(), err, context.Canceled)
}

func (s *ClientSuite) TestHostileHashStaysOneSegment() {
	for _, hash := range []string{"../x", "..", "a?b", "%2f", "a#b"} {
		s.Run(hash, func() {
			var escaped, query string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				escaped, query = r.URL.EscapedPath(), r.URL.RawQuery
				http.NotFound(w, r)
			}))
			s.T().Cleanup(srv.Close)

			_, _ = s.client(srv.URL).Open(s.T().Context(), hash, 0)

			rest, ok := strings.CutPrefix(escaped, "/assets/")
			assert.Assert(s.T(), ok, escaped)
			assert.Assert(s.T(), !strings.Contains(rest, "/"), escaped)
			assert.Equal(s.T(), query, "")
		})
	}
}
