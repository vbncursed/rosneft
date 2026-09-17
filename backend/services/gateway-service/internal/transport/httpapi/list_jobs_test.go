package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

type ListJobsSuite struct{ suite.Suite }

func TestListJobsSuite(t *testing.T) { suite.Run(t, new(ListJobsSuite)) }

var (
	runningYard   = domain.Job{ID: "j1", Kind: domain.KindTerritory, Slug: "yard", Status: domain.JobStatusRunning}
	failedBlock   = domain.Job{ID: "j2", Kind: domain.KindTerritory, Slug: "block", Status: domain.JobStatusFailed}
	doneBlock     = domain.Job{ID: "j3", Kind: domain.KindTerritory, Slug: "done", Status: domain.JobStatusSucceeded}
	pendingPump   = domain.Job{ID: "j4", Kind: domain.KindModel, Slug: "pump", Status: domain.JobStatusPending}
	unknownKind   = domain.Job{ID: "j5", Kind: "", Slug: "yard", Status: domain.JobStatusRunning}
	allTargetJobs = []domain.Job{runningYard, failedBlock, doneBlock, pendingPump}
)

// The whole catalog, as the real ListTerritories answers an empty scope: ""
// turns its tenant filter off and resolves every row.
var allTerritories = []domain.Territory{{Slug: "yard"}, {Slug: "block"}, {Slug: "done"}}

// The rule, on its own: succeeded never, models always, territories only when visible.
func (s *ListJobsSuite) TestVisibleJob() {
	visible := map[string]bool{"yard": true}
	assert.Assert(s.T(), visibleJob(runningYard, visible, false))
	assert.Assert(s.T(), !visibleJob(failedBlock, visible, false))
	assert.Assert(s.T(), visibleJob(failedBlock, visible, true), "Root sees every territory")
	assert.Assert(s.T(), visibleJob(pendingPump, map[string]bool{}, false), "models are shared")
	assert.Assert(s.T(), !visibleJob(doneBlock, visible, true), "succeeded is never listed")
	assert.Assert(s.T(), !visibleJob(unknownKind, visible, false), "an unknown kind has no rule that admits it")
	assert.Assert(s.T(), !visibleJob(unknownKind, visible, true), "and Root does not get one either")
}

// jobsServiceStub answers the two reads the handler makes and panics on
// anything else, so a handler that starts touching more is caught here.
type jobsServiceStub struct {
	Service
	territories []domain.Territory
	listErr     error
}

func (j jobsServiceStub) ListTargetJobs(context.Context) ([]domain.Job, error) {
	return allTargetJobs, j.listErr
}

func (j jobsServiceStub) ListTerritories(_ context.Context, scopeAdminID string) ([]domain.Territory, error) {
	if scopeAdminID == "" {
		return allTerritories, nil
	}
	return j.territories, nil
}

func (s *ListJobsSuite) get(stub Service, ctx context.Context) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	}).Get("/api/jobs", New(stub).ListJobs)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/jobs", nil))
	return rec
}

func ids(s *ListJobsSuite, rec *httptest.ResponseRecorder) []string {
	var body []Job
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	out := make([]string, len(body))
	for i, j := range body {
		out[i] = j.Id
	}
	return out
}

func (s *ListJobsSuite) TestRootSeesEveryLiveJob() {
	rec := s.get(jobsServiceStub{}, authhttp.NewTestContext(context.Background(), true, ""))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	assert.DeepEqual(s.T(), ids(s, rec), []string{"j1", "j2", "j4"})
}

func (s *ListJobsSuite) TestScopedCallerSeesOwnTerritoriesAndEveryModel() {
	stub := jobsServiceStub{territories: []domain.Territory{{Slug: "yard"}}}
	rec := s.get(stub, authhttp.NewTestContext(context.Background(), false, "admin-1"))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.DeepEqual(s.T(), ids(s, rec), []string{"j1", "j4"})
}

func (s *ListJobsSuite) TestScopedCallerWithNoAdminSeesNothing() {
	rec := s.get(jobsServiceStub{}, authhttp.NewTestContext(context.Background(), false, ""))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Body.String(), "[]\n")
}

func (s *ListJobsSuite) TestMeshOutageIsA500NotAnEmptyList() {
	rec := s.get(jobsServiceStub{listErr: context.DeadlineExceeded}, authhttp.NewTestContext(context.Background(), true, ""))
	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
}
