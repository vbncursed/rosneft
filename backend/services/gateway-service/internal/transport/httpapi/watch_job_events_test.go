package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type WatchJobEventsSuite struct{ suite.Suite }

func TestWatchJobEventsSuite(t *testing.T) { suite.Run(t, new(WatchJobEventsSuite)) }

// streamJob had no test before this. A terminal job is the shape that ends
// the loop on its own, so it is the one a unit test can drive to completion.
func (s *WatchJobEventsSuite) TestStreamEmitsATerminalJobOnceAndReturns() {
	rec := httptest.NewRecorder()
	done := domain.Job{ID: "j1", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusSucceeded}
	fetch := func(context.Context, string) (domain.Job, error) { return done, nil }
	streamJob(context.Background(), rec, rec, "j1", fetch)
	body := rec.Body.String()
	assert.Assert(s.T(), strings.HasPrefix(body, "event: job\n"), body)
	assert.Assert(s.T(), strings.Contains(body, `"status":"succeeded"`), body)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 1)
}

func (s *WatchJobEventsSuite) TestStreamReportsAnUnknownJobAsAnErrorFrame() {
	rec := httptest.NewRecorder()
	fetch := func(context.Context, string) (domain.Job, error) { return domain.Job{}, domain.ErrJobNotFound }
	streamJob(context.Background(), rec, rec, "nope", fetch)
	assert.Assert(s.T(), strings.HasPrefix(rec.Body.String(), "event: error\n"), rec.Body.String())
}

type watchServiceStub struct {
	Service
	job      domain.Job
	visible  map[string]bool
	lookedUp []string
}

func (w *watchServiceStub) GetJob(context.Context, string) (domain.Job, error) { return w.job, nil }

func (w *watchServiceStub) GetTerritory(_ context.Context, slug, _ string) (domain.Territory, error) {
	w.lookedUp = append(w.lookedUp, slug)
	if w.visible[slug] {
		return domain.Territory{Slug: slug}, nil
	}
	return domain.Territory{}, domain.ErrTerritoryNotFound
}

// The same 404-shaped refusal the territory routes give: a scoped caller who
// cannot see the territory gets "job not found", never a 403 that confirms it.
func (s *WatchJobEventsSuite) TestScopedFetchHidesAnotherTenantsTerritoryJob() {
	stub := &watchServiceStub{
		job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning},
	}
	srv := New(stub)
	ctx := authhttp.NewTestContext(context.Background(), false, "admin-1")
	_, err := srv.scopedJob(ctx, "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
	assert.DeepEqual(s.T(), stub.lookedUp, []string{"theirs"})
}

func (s *WatchJobEventsSuite) TestScopedFetchPassesOwnTerritoryModelsAndRoot() {
	own := &watchServiceStub{
		job:     domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "mine", Status: domain.JobStatusRunning},
		visible: map[string]bool{"mine": true},
	}
	_, err := New(own).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j1")
	assert.NilError(s.T(), err)

	model := &watchServiceStub{
		job: domain.Job{ID: "j2", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusRunning},
	}
	_, err = New(model).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j2")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(model.lookedUp), 0, "a model never asks the catalog")

	root := &watchServiceStub{
		job: domain.Job{ID: "j3", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning},
	}
	_, err = New(root).scopedJob(authhttp.NewTestContext(context.Background(), true, ""), "j3")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(root.lookedUp), 0, "Root skips the lookup")
}

// Fail closed on an unscoped principal, exactly as RequireTerritoryAccess
// does: passing "" to the catalog disables its tenant filter, so the lookup
// would resolve any territory and hand back its job.
func (s *WatchJobEventsSuite) TestScopedFetchRefusesAPrincipalWithoutACompany() {
	stub := &watchServiceStub{
		job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning},
	}
	_, err := New(stub).scopedJob(authhttp.NewTestContext(context.Background(), false, ""), "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
	assert.Equal(s.T(), len(stub.lookedUp), 0, "an unscoped principal must be refused before the lookup")
}

// A kind this gateway has no rule for is refused before the catalog is asked
// — Root included. The guard used to read `Kind != KindTerritory`, which
// admitted every kind the gateway does not know as if it were a model.
func (s *WatchJobEventsSuite) TestScopedFetchRefusesAJobOfAnUnknownKind() {
	job := domain.Job{ID: "j1", Kind: "", Slug: "mine", Status: domain.JobStatusRunning}
	scoped := &watchServiceStub{job: job, visible: map[string]bool{"mine": true}}
	_, err := New(scoped).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
	assert.Equal(s.T(), len(scoped.lookedUp), 0, "an unknown kind is refused before the lookup")

	root := &watchServiceStub{job: job}
	_, err = New(root).scopedJob(authhttp.NewTestContext(context.Background(), true, ""), "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound), "Root does not get a rule either")
}

// flushCounter is a recorder whose Flush calls are counted, so a test can pin
// that every frame is followed by exactly one flush.
type flushCounter struct {
	*httptest.ResponseRecorder
	flushes int
}

func (f *flushCounter) Flush() { f.flushes++ }

// failingWriter refuses every write, as a client that went away does.
type failingWriter struct {
	header  http.Header
	flushes int
}

func (f *failingWriter) Header() http.Header       { return f.header }
func (f *failingWriter) WriteHeader(int)           {}
func (f *failingWriter) Write([]byte) (int, error) { return 0, errors.New("client gone") }
func (f *failingWriter) Flush()                    { f.flushes++ }

type fetchResult struct {
	job domain.Job
	err error
}

// scriptedFetch answers the queued results in order and repeats the last one.
func scriptedFetch(results ...fetchResult) func(context.Context, string) (domain.Job, error) {
	i := 0
	return func(context.Context, string) (domain.Job, error) {
		r := results[min(i, len(results)-1)]
		i++
		return r.job, r.err
	}
}

// runStream drives streamJob in a synctest bubble, lets fake time pass for
// each step and returns what was written, how often it flushed and whether
// the stream had returned on its own before the cancel.
func runStream(
	t *testing.T,
	fetch func(context.Context, string) (domain.Job, error),
	run time.Duration,
) (body string, flushes int, returned bool) {
	t.Helper()
	synctest.Test(t, func(t *testing.T) {
		rec := &flushCounter{ResponseRecorder: httptest.NewRecorder()}
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			streamJob(ctx, rec, rec, "j1", fetch)
		}()
		time.Sleep(run)
		synctest.Wait()
		select {
		case <-done:
			returned = true
		default:
		}
		cancel()
		<-done
		body, flushes = rec.Body.String(), rec.flushes
	})
	return body, flushes, returned
}

func job(status domain.JobStatus, updated int) domain.Job {
	return domain.Job{
		ID: "j1", Kind: domain.KindModel, Slug: "pump", Status: status,
		UpdatedAt: time.Unix(int64(updated), 0),
	}
}

func (s *WatchJobEventsSuite) TestStreamSendsTheFirstSnapshotAtOnceThenStopsOnCancel() {
	body, flushes, returned := runStream(s.T(), scriptedFetch(fetchResult{job: job(domain.JobStatusRunning, 1)}), 0)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 1, body)
	assert.Equal(s.T(), flushes, 1)
	assert.Assert(s.T(), !returned, "a running job keeps the stream open")
}

func (s *WatchJobEventsSuite) TestStreamEmitsOnlyWhenTheJobChanges() {
	fetch := scriptedFetch(
		fetchResult{job: job(domain.JobStatusRunning, 1)},
		fetchResult{job: job(domain.JobStatusRunning, 1)}, // tick 1: same, silent
		fetchResult{job: job(domain.JobStatusRunning, 2)}, // tick 2: UpdatedAt moved
		fetchResult{job: job(domain.JobStatusPending, 2)}, // tick 3: Status moved
		fetchResult{job: job(domain.JobStatusPending, 2)}, // tick 4: same again
	)
	body, flushes, returned := runStream(s.T(), fetch, 4*jobEventInterval)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 3, body)
	assert.Equal(s.T(), flushes, 3)
	assert.Assert(s.T(), !returned)
}

func (s *WatchJobEventsSuite) TestStreamClosesAfterATickDeliversATerminalState() {
	fetch := scriptedFetch(
		fetchResult{job: job(domain.JobStatusRunning, 1)},
		fetchResult{job: job(domain.JobStatusFailed, 2)},
	)
	body, flushes, returned := runStream(s.T(), fetch, 5*jobEventInterval)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 2, body)
	assert.Assert(s.T(), strings.HasSuffix(body, "\n\n") && strings.Contains(body, `"status":"failed"`), body)
	assert.Equal(s.T(), flushes, 2)
	assert.Assert(s.T(), returned, "a terminal state ends the stream on its own")
}

func (s *WatchJobEventsSuite) TestStreamSurvivesFetchErrorsAtTheStartAndOnTicks() {
	boom := errors.New("mesh-api down")
	fetch := scriptedFetch(
		fetchResult{err: boom},                            // first fetch: not ErrJobNotFound, so no frame and no exit
		fetchResult{err: boom},                            // tick 1
		fetchResult{job: job(domain.JobStatusRunning, 1)}, // tick 2: differs from the zero job
		fetchResult{err: boom},                            // tick 3
	)
	body, _, returned := runStream(s.T(), fetch, 3*jobEventInterval)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 1, body)
	assert.Assert(s.T(), !strings.Contains(body, "event: error"), body)
	assert.Assert(s.T(), !returned)
}

func (s *WatchJobEventsSuite) TestStreamSendsAKeepaliveCommentWhenQuiet() {
	fetch := scriptedFetch(fetchResult{job: job(domain.JobStatusRunning, 1)})
	body, flushes, _ := runStream(s.T(), fetch, jobEventKeepalive)
	assert.Equal(s.T(), strings.Count(body, ": keepalive\n\n"), 1, body)
	assert.Equal(s.T(), strings.Count(body, "event: job"), 1, body)
	assert.Equal(s.T(), flushes, 2, "one flush for the snapshot, one for the keepalive")
}

func (s *WatchJobEventsSuite) TestStreamAnswersAnUnknownJobWithTheErrorBodyAndOneFlush() {
	rec := &flushCounter{ResponseRecorder: httptest.NewRecorder()}
	fetch := scriptedFetch(fetchResult{err: domain.ErrJobNotFound})
	streamJob(context.Background(), rec, rec, "nope", fetch)
	want := "event: error\ndata: {\"code\":\"not_found\",\"message\":\"job not found\"}\n\n"
	assert.Equal(s.T(), rec.Body.String(), want)
	assert.Equal(s.T(), rec.flushes, 1)
}

// A failed write is not a stop signal (emit reports only "terminal"): the
// frame is not flushed and the loop carries on until the context ends.
func (s *WatchJobEventsSuite) TestStreamDoesNotFlushAFailedWriteAndEndsOnContext() {
	w := &failingWriter{header: http.Header{}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	streamJob(ctx, w, w, "j1", scriptedFetch(fetchResult{job: job(domain.JobStatusRunning, 1)}))
	assert.Equal(s.T(), w.flushes, 0)
}

func (s *WatchJobEventsSuite) TestStreamStopsOnAnAlreadyCancelledContext() {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	rec := &flushCounter{ResponseRecorder: httptest.NewRecorder()}
	streamJob(ctx, rec, rec, "j1", scriptedFetch(fetchResult{job: job(domain.JobStatusRunning, 1)}))
	assert.Equal(s.T(), strings.Count(rec.Body.String(), "event: job"), 1, "the first snapshot still goes out")
}

func (s *WatchJobEventsSuite) TestIsTerminalJob() {
	for status, want := range map[domain.JobStatus]bool{
		domain.JobStatusPending:   false,
		domain.JobStatusRunning:   false,
		domain.JobStatusSucceeded: true,
		domain.JobStatusFailed:    true,
	} {
		assert.Equal(s.T(), isTerminalJob(domain.Job{Status: status}), want, string(status))
	}
}

func (s *WatchJobEventsSuite) TestJobChanged() {
	base := job(domain.JobStatusRunning, 1)
	assert.Assert(s.T(), !jobChanged(base, base))
	assert.Assert(s.T(), jobChanged(base, job(domain.JobStatusRunning, 2)))
	assert.Assert(s.T(), jobChanged(base, job(domain.JobStatusFailed, 1)))
}
