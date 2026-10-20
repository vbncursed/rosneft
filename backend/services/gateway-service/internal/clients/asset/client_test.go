package asset

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
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
