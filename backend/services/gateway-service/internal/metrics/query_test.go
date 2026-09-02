package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type QuerySuite struct {
	suite.Suite
}

func TestQuerySuite(t *testing.T) {
	suite.Run(t, new(QuerySuite))
}

// serving starts a Prometheus stand-in and returns a Client pointed at it.
func (s *QuerySuite) serving(h http.HandlerFunc) *Client {
	srv := httptest.NewServer(h)
	s.T().Cleanup(srv.Close)
	return NewClient(srv.URL)
}

func (s *QuerySuite) TestStepSeconds() {
	// Never finer than the scrape interval, always a whole number of scrapes.
	for _, window := range []int{900, 3600, 21600, 86400, 604800} {
		step := stepSeconds(window)
		assert.Assert(s.T(), step >= scrapeSeconds, "window %d gave step %d", window, step)
		assert.Equal(s.T(), step%scrapeSeconds, 0)
	}
}

func (s *QuerySuite) TestUnknownPanel() {
	c := s.serving(func(http.ResponseWriter, *http.Request) {})
	_, err := c.Query(s.T().Context(), "no-such-panel", "1h")
	assert.ErrorIs(s.T(), err, ErrUnknownPanel)
}

func (s *QuerySuite) TestBadRange() {
	c := s.serving(func(http.ResponseWriter, *http.Request) {})
	_, err := c.Query(s.T().Context(), "stat-up", "99y")
	assert.ErrorIs(s.T(), err, ErrBadRange)
}

func (s *QuerySuite) TestOversizedResponseIsRefused() {
	// A misconfigured or hostile PROMETHEUS_URL must not be able to balloon
	// gateway memory: the read is capped rather than unbounded.
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		chunk := strings.Repeat("x", 1<<20)
		for range (maxResponseBytes >> 20) + 2 {
			if _, err := w.Write([]byte(chunk)); err != nil {
				return
			}
		}
	})

	_, err := c.Query(s.T().Context(), "stat-up", "1h")
	assert.ErrorContains(s.T(), err, "exceeds")
}

func (s *QuerySuite) TestNonOKStatus() {
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	_, err := c.Query(s.T().Context(), "stat-up", "1h")
	assert.ErrorContains(s.T(), err, "502")
}

func (s *QuerySuite) TestInstantQueryReachesPrometheus() {
	var gotPath, gotQuery string
	c := s.serving(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotQuery = r.URL.Path, r.URL.Query().Get("query")
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`))
	})

	_, err := c.Query(s.T().Context(), "stat-up", "1h")
	assert.NilError(s.T(), err)
	// stat panels are instant queries; range panels hit /query_range.
	assert.Equal(s.T(), gotPath, "/api/v1/query")
	assert.Assert(s.T(), gotQuery != "", "PromQL expression must reach Prometheus")
}

func (s *QuerySuite) TestRangeQueryUsesQueryRange() {
	var gotPath, gotStep string
	c := s.serving(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotStep = r.URL.Path, r.URL.Query().Get("step")
		_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
	})

	_, err := c.Query(s.T().Context(), "red-rate", "6h")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), gotPath, "/api/v1/query_range")
	// 21600s / 200 points = 108s, rounded to 7 whole scrapes = 105s.
	assert.Equal(s.T(), gotStep, "105")
}

// The dashboard's shortest window. 900/200 rounds below one scrape, so the
// floor in stepSeconds is what keeps the step legal.
func (s *QuerySuite) TestFifteenMinuteRangeIsAllowed() {
	window, ok := rangeSeconds["15m"]
	assert.Assert(s.T(), ok, "15m missing from the range allow-list")
	assert.Equal(s.T(), window, 900)
	assert.Equal(s.T(), stepSeconds(window), 15)
}
