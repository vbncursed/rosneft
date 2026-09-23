package bootstrap

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// InitPrometheus builds the one Prometheus client the metrics proxy and the
// console summary's alerts card share.
func InitPrometheus(cfg config.Config) *metrics.Client {
	return metrics.NewClient(cfg.PrometheusURL)
}

// InitMetricsHandler builds the owner-only Prometheus proxy behind
// /api/metrics/query: a plain http.Handler on the root router (wrapped with
// Authenticate for the owner check), outside the openapi strict handlers. The
// client sends panel IDs plus one range; the metrics client resolves each ID to
// server-side PromQL, so no query reaches Prometheus as free-form input.
func InitMetricsHandler(client *metrics.Client, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authhttp.IsOwner(r.Context()) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "root only")
			return
		}

		q := r.URL.Query()
		series, err := client.QueryPanels(r.Context(), q["panel"], q.Get("range"))
		switch {
		case errors.Is(err, metrics.ErrUnknownPanel) || errors.Is(err, metrics.ErrBadRange):
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "unknown panel or range")
			return
		case err != nil:
			// Log the upstream detail once; return a generic error so Prometheus
			// internals never leak to the browser.
			logger.Warn("metrics: prometheus query failed", "panels", q["panel"], "err", err)
			apperr.Write(w, http.StatusBadGateway, apperr.SlugInternal, "metric upstream unavailable")
			return
		}

		if missing := missingPanels(q["panel"], series); len(missing) > 0 {
			logger.Warn("metrics: panels left out of a partial answer", "missing", missing)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(series); err != nil {
			logger.Warn("metrics: encode response failed", "err", err)
		}
	})
}

// missingPanels lists, once each, the requested ids a partial answer lacks: a
// 200 carries no error, so the log is the only place a dark card is explained.
func missingPanels(requested []string, got map[string][]metrics.Series) []string {
	var missing []string
	for _, id := range slices.Compact(slices.Sorted(slices.Values(requested))) {
		if _, ok := got[id]; !ok {
			missing = append(missing, id)
		}
	}
	return missing
}
