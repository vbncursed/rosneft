package bootstrap

import (
	"encoding/json/v2"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// MetricsHandlerSuite drives /api/metrics/query against a Prometheus stand-in.
type MetricsHandlerSuite struct{ suite.Suite }

func TestMetricsHandlerSuite(t *testing.T) { suite.Run(t, new(MetricsHandlerSuite)) }

func (s *MetricsHandlerSuite) handler(prom http.HandlerFunc) http.Handler {
	srv := httptest.NewServer(prom)
	s.T().Cleanup(srv.Close)
	return InitMetricsHandler(metrics.NewClient(srv.URL), slog.New(slog.DiscardHandler))
}

func (s *MetricsHandlerSuite) get(h http.Handler, owner bool, query string) *httptest.ResponseRecorder {
	ctx := authhttp.NewTestContext(s.T().Context(), owner, "")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/metrics/query?"+query, nil))
	return rec
}

func emptyPromVector(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"vector","result":[]}}`))
}

func (s *MetricsHandlerSuite) TestAnswersEveryPanelUnderItsID() {
	rec := s.get(s.handler(emptyPromVector), true, "panel=stat-up&panel=alerts&range=1h")

	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	var body map[string][]metrics.Series
	assert.NilError(s.T(), json.Unmarshal(rec.Body.Bytes(), &body))
	assert.DeepEqual(s.T(), slices.Sorted(maps.Keys(body)), []string{"alerts", "stat-up"})
}

func (s *MetricsHandlerSuite) TestRefusesWhatTheRegistryDoesNotKnow() {
	h := s.handler(emptyPromVector)
	for _, q := range []string{"range=1h", "panel=stat-up&panel=nope&range=1h", "panel=stat-up&range=99y"} {
		assert.Equal(s.T(), s.get(h, true, q).Code, http.StatusBadRequest, q)
	}
}

func (s *MetricsHandlerSuite) TestANonOwnerIsRefused() {
	rec := s.get(s.handler(emptyPromVector), false, "panel=stat-up&range=1h")
	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
}

func (s *MetricsHandlerSuite) TestAnUpstreamFailureIsABadGateway() {
	rec := s.get(s.handler(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}), true, "panel=stat-up&range=1h")
	assert.Equal(s.T(), rec.Code, http.StatusBadGateway)
}
