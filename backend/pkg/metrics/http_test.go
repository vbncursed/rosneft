package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type HTTPMiddlewareSuite struct{ suite.Suite }

func TestHTTPMiddlewareSuite(t *testing.T) { suite.Run(t, new(HTTPMiddlewareSuite)) }

func (s *HTTPMiddlewareSuite) TestRecordsTheStatus() {
	before := testutil.ToFloat64(httpHandled.WithLabelValues("PUT", "418"))
	h := Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPut, "/", nil))

	assert.Equal(s.T(), testutil.ToFloat64(httpHandled.WithLabelValues("PUT", "418"))-before, 1.0)
}

// A stream cut after the status line (Recoverer re-panics ErrAbortHandler)
// is counted once, as aborted, never as the 200 it started with.
func (s *HTTPMiddlewareSuite) TestCountsAnAbortedStream() {
	before := testutil.ToFloat64(httpHandled.WithLabelValues("PATCH", "aborted"))
	h := Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		panic(http.ErrAbortHandler)
	}))

	var recovered any
	func() {
		defer func() { recovered = recover() }()
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPatch, "/", nil))
	}()

	assert.Equal(s.T(), recovered, any(http.ErrAbortHandler), "the panic must pass through")
	assert.Equal(s.T(), testutil.ToFloat64(httpHandled.WithLabelValues("PATCH", "aborted"))-before, 1.0)
	assert.Equal(s.T(), testutil.ToFloat64(httpHandled.WithLabelValues("PATCH", "200")), 0.0)
}
