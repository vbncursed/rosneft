package metrics

import (
	"context"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"gotest.tools/v3/assert"
)

const emptyVector = `{"status":"success","data":{"resultType":"vector","result":[]}}`

func (s *QuerySuite) TestQueryPanelsAnswersEachDistinctPanelOnce() {
	var asked atomic.Int32
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		asked.Add(1)
		_, _ = w.Write([]byte(emptyVector))
	})

	got, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts", "stat-up"}, "1h")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(got)), []string{"alerts", "stat-up"})
	assert.Equal(s.T(), asked.Load(), int32(2))
	assert.Assert(s.T(), got["alerts"] != nil, "an empty panel is [], never null")
}

// Validation is all-or-nothing and happens before the first request: one bad
// id must not leave Prometheus half-asked.
func (s *QuerySuite) TestQueryPanelsRefusesAnUnknownPanelBeforeAsking() {
	var asked atomic.Int32
	c := s.serving(func(http.ResponseWriter, *http.Request) { asked.Add(1) })

	_, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "no-such-panel"}, "1h")
	assert.ErrorIs(s.T(), err, ErrUnknownPanel)
	_, err = c.QueryPanels(s.T().Context(), nil, "1h")
	assert.ErrorIs(s.T(), err, ErrUnknownPanel)
	_, err = c.QueryPanels(s.T().Context(), []string{"stat-up"}, "99y")
	assert.ErrorIs(s.T(), err, ErrBadRange)
	assert.Equal(s.T(), asked.Load(), int32(0))
}

func (s *QuerySuite) TestQueryPanelsRunsAtMostFourAtOnce() {
	var inFlight, peak atomic.Int32
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		n := inFlight.Add(1)
		for p := peak.Load(); n > p && !peak.CompareAndSwap(p, n); p = peak.Load() {
		}
		time.Sleep(20 * time.Millisecond)
		inFlight.Add(-1)
		_, _ = w.Write([]byte(emptyVector))
	})

	_, err := c.QueryPanels(s.T().Context(), slices.Collect(maps.Keys(panels)), "1h")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), peak.Load() <= maxParallelPanels, "peak %d", peak.Load())
	assert.Assert(s.T(), peak.Load() > 1, "the panels ran one at a time")
}

// One broken panel is one dark card, not a dark page: it is left out of the
// map and the rest still answer.
func (s *QuerySuite) TestQueryPanelsLeavesOutAFailedPanel() {
	c := s.serving(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Query().Get("query"), "ALERTS") {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(emptyVector))
	})

	got, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts"}, "1h")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(got)), []string{"stat-up"})
}

func (s *QuerySuite) TestQueryPanelsFailsOnlyWhenEveryPanelFails() {
	c := s.serving(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	_, err := c.QueryPanels(s.T().Context(), []string{"stat-up", "alerts"}, "1h")
	assert.ErrorContains(s.T(), err, "502")
}

// A hung Prometheus must not keep the page dark for a per-query timeout per
// wave of panels: the whole call shares one deadline, and a panel still
// waiting for a slot when it passes gives up without asking.
func (s *QuerySuite) TestQueryPanelsGivesUpTogetherUnderOneDeadline() {
	var asked atomic.Int32
	c := s.serving(func(_ http.ResponseWriter, r *http.Request) {
		asked.Add(1)
		<-r.Context().Done()
	})
	c.panelsTimeout = 100 * time.Millisecond

	ids := slices.Collect(maps.Keys(panels))
	assert.Assert(s.T(), len(ids) > maxParallelPanels, "needs panels left waiting for a slot")
	start := time.Now()
	_, err := c.QueryPanels(s.T().Context(), ids, "1h")
	assert.ErrorIs(s.T(), err, context.DeadlineExceeded)
	assert.Assert(s.T(), time.Since(start) < queryTimeout, "took %v", time.Since(start))
	assert.Assert(s.T(), asked.Load() <= maxParallelPanels, "a queued panel still asked: %d", asked.Load())
}
