package summary_test

import (
	"context"
	"encoding/json/v2"
	"errors"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

type SummarySuite struct{ suite.Suite }

func TestSummarySuite(t *testing.T) { suite.Run(t, new(SummarySuite)) }

var cards = []string{"access", "alerts", "audit24h", "content", "roles", "users"}

// answering returns one source per card that answers 1 and records that it ran.
func answering(ran *sync.Map) summary.Counts {
	out := summary.Counts{}
	for _, key := range cards {
		out[key] = func(context.Context) (any, error) {
			ran.Store(key, true)
			return 1, nil
		}
	}
	return out
}

func (s *SummarySuite) serve(p authhttp.TestPrincipal, counts summary.Counts) (*httptest.ResponseRecorder, map[string]any) {
	ctx := authhttp.NewTestContextFor(s.T().Context(), p)
	rec := httptest.NewRecorder()
	summary.Handler(counts, slog.New(slog.DiscardHandler)).
		ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/console/summary", nil))
	var body map[string]any
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	return rec, body
}

func ranKeys(ran *sync.Map) []string {
	var out []string
	ran.Range(func(k, _ any) bool { out = append(out, k.(string)); return true })
	slices.Sort(out)
	return out
}

func (s *SummarySuite) TestRootOpensEveryCard() {
	var ran sync.Map
	rec, body := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, answering(&ran))
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), cards)
}

// A Company Owner holds the grants below and is not Root: access and alerts
// are Root's screens, so their sources are never asked.
func (s *SummarySuite) TestACompanyOwnerSeesItsOwnScreens() {
	var ran sync.Map
	co := authhttp.TestPrincipal{
		UserID: "co", OwningAdmin: "co", AuditCompany: "co",
		Perms: []string{"users:read", "roles:read", "territory:write", "audit:read"},
	}
	_, body := s.serve(co, answering(&ran))
	want := []string{"audit24h", "content", "roles", "users"}
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), want)
	assert.DeepEqual(s.T(), ranKeys(&ran), want)
}

func (s *SummarySuite) TestModelWriteAloneOpensContent() {
	var ran sync.Map
	_, body := s.serve(authhttp.TestPrincipal{UserID: "m", Perms: []string{"model:write"}}, answering(&ran))
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), []string{"content"})
	assert.DeepEqual(s.T(), ranKeys(&ran), []string{"content"})
}

func (s *SummarySuite) TestAViewerGetsAnEmptyObject() {
	var ran sync.Map
	_, body := s.serve(authhttp.TestPrincipal{UserID: "v", Perms: []string{"territory:read"}}, answering(&ran))
	assert.Equal(s.T(), len(body), 0)
	assert.Equal(s.T(), len(ranKeys(&ran)), 0)
}

func (s *SummarySuite) TestAFailedSourceIsNullForItsCardOnly() {
	var ran sync.Map
	counts := answering(&ran)
	counts["alerts"] = func(context.Context) (any, error) { return 3, errors.New("prometheus down") }

	rec, body := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, counts)
	assert.Equal(s.T(), rec.Code, http.StatusOK)
	v, ok := body["alerts"]
	assert.Assert(s.T(), ok, "a failed card stays in the answer")
	assert.Assert(s.T(), v == nil, "as null, got %v", v)
	assert.Equal(s.T(), body["users"], 1.0)
}

// One source that never answers darkens its own card, not the page: it gets
// its own deadline, and the rest answer on time. Inside a synctest bubble the
// deadline passes in fake time; without one the blocked source is a deadlock
// the bubble reports.
func (s *SummarySuite) TestASlowSourceIsNullForItsCardOnly() {
	synctest.Test(s.T(), func(t *testing.T) {
		var ran sync.Map
		counts := answering(&ran)
		counts["alerts"] = func(ctx context.Context) (any, error) {
			<-ctx.Done()
			return nil, ctx.Err()
		}

		start := time.Now()
		ctx := authhttp.NewTestContextFor(t.Context(), authhttp.TestPrincipal{UserID: "root", IsOwner: true})
		rec := httptest.NewRecorder()
		summary.Handler(counts, slog.New(slog.DiscardHandler)).
			ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/console/summary", nil))

		var body map[string]any
		assert.NilError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		v, ok := body["alerts"]
		assert.Assert(t, ok && v == nil, "the slow card is null, got %v", v)
		assert.Equal(t, body["users"], 1.0)
		assert.Assert(t, time.Since(start) <= 5*time.Second, "took %v", time.Since(start))
	})
}

func (s *SummarySuite) TestTheAnswerIsNeverCached() {
	var ran sync.Map
	rec, _ := s.serve(authhttp.TestPrincipal{UserID: "root", IsOwner: true}, answering(&ran))
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/json")
}
