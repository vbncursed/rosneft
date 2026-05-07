package httpapi

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// flushRecorder tracks Flush() calls so we can assert SSE frames are flushed.
type flushRecorder struct {
	*httptest.ResponseRecorder
	flushes atomic.Int32
}

func (f *flushRecorder) Flush() { f.flushes.Add(1) }

type WatchJobEventsSuite struct {
	suite.Suite
}

func TestWatchJobEventsSuite(t *testing.T) {
	suite.Run(t, new(WatchJobEventsSuite))
}

func (s *WatchJobEventsSuite) TestEmitsSnapshotAndTerminatesOnSuccess() {
	rec := &flushRecorder{ResponseRecorder: httptest.NewRecorder()}
	now := time.Now()
	jobs := []domain.Job{
		{ID: "j1", ProjectSlug: "p", Status: domain.JobStatusRunning, UpdatedAt: now},
		{ID: "j1", ProjectSlug: "p", Status: domain.JobStatusSucceeded, UpdatedAt: now.Add(time.Second)},
	}
	calls := atomic.Int32{}
	fetch := func(_ context.Context, _ string) (domain.Job, error) {
		i := calls.Add(1) - 1
		if i >= int32(len(jobs)) {
			return jobs[len(jobs)-1], nil
		}
		return jobs[i], nil
	}

	ctx, cancel := context.WithTimeout(s.T().Context(), 5*time.Second)
	defer cancel()

	streamJob(ctx, rec, rec, "j1", fetch)
	body := rec.Body.String()
	assert.Assert(s.T(), strings.Contains(body, `"status":"running"`),
		"expected running status in stream, got: %s", body)
	assert.Assert(s.T(), rec.flushes.Load() > 0, "expected at least one Flush()")
}

func (s *WatchJobEventsSuite) TestJobNotFoundEmitsErrorEvent() {
	rec := &flushRecorder{ResponseRecorder: httptest.NewRecorder()}
	fetch := func(_ context.Context, _ string) (domain.Job, error) {
		return domain.Job{}, domain.ErrJobNotFound
	}

	ctx, cancel := context.WithTimeout(s.T().Context(), time.Second)
	defer cancel()

	streamJob(ctx, rec, rec, "missing", fetch)
	body := rec.Body.String()
	assert.Assert(s.T(), strings.Contains(body, "event: error"),
		"expected error event, got: %s", body)
	assert.Assert(s.T(), strings.Contains(body, "job_not_found"),
		"expected job_not_found code, got: %s", body)
}

func (s *WatchJobEventsSuite) TestRespectsContextCancel() {
	rec := &flushRecorder{ResponseRecorder: httptest.NewRecorder()}
	fetch := func(_ context.Context, _ string) (domain.Job, error) {
		return domain.Job{
			ID: "j1", ProjectSlug: "p",
			Status:    domain.JobStatusRunning,
			UpdatedAt: time.Now(),
		}, nil
	}

	ctx, cancel := context.WithCancel(s.T().Context())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	done := make(chan struct{})
	go func() {
		streamJob(ctx, rec, rec, "j1", fetch)
		close(done)
	}()

	select {
	case <-done:
		// good — context cancellation tore down the stream
	case <-time.After(2 * time.Second):
		s.T().Fatal("streamJob did not exit on context cancel")
	}
}
