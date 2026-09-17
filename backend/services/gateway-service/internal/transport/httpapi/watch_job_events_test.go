package httpapi

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

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
	stub := &watchServiceStub{job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning}}
	srv := New(stub)
	ctx := authhttp.NewTestContext(context.Background(), false, "admin-1")
	_, err := srv.scopedJob(ctx, "j1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrJobNotFound))
	assert.DeepEqual(s.T(), stub.lookedUp, []string{"theirs"})
}

func (s *WatchJobEventsSuite) TestScopedFetchPassesOwnTerritoryModelsAndRoot() {
	own := &watchServiceStub{job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "mine", Status: domain.JobStatusRunning}, visible: map[string]bool{"mine": true}}
	_, err := New(own).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j1")
	assert.NilError(s.T(), err)

	model := &watchServiceStub{job: domain.Job{ID: "j2", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusRunning}}
	_, err = New(model).scopedJob(authhttp.NewTestContext(context.Background(), false, "admin-1"), "j2")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(model.lookedUp), 0, "a model never asks the catalog")

	root := &watchServiceStub{job: domain.Job{ID: "j3", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning}}
	_, err = New(root).scopedJob(authhttp.NewTestContext(context.Background(), true, ""), "j3")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(root.lookedUp), 0, "Root skips the lookup")
}

// Fail closed on an unscoped principal, exactly as RequireTerritoryAccess
// does: passing "" to the catalog disables its tenant filter, so the lookup
// would resolve any territory and hand back its job.
func (s *WatchJobEventsSuite) TestScopedFetchRefusesAPrincipalWithoutACompany() {
	stub := &watchServiceStub{job: domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "theirs", Status: domain.JobStatusRunning}}
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
