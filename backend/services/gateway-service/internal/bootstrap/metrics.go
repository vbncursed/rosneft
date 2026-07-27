package bootstrap

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// InitMetricsHandler builds the owner-only Prometheus proxy handler behind
// /api/metrics/query. It mirrors InitAssetProxy: a plain http.Handler mounted
// on the root router (wrapped with Authenticate for the owner check), outside
// the openapi strict handlers. The client sends a panel ID + range; the metrics
// client resolves the ID to server-side PromQL, so no query reaches Prometheus
// as free-form input.
func InitMetricsHandler(cfg config.Config, logger *slog.Logger) http.Handler {
	client := metrics.NewClient(cfg.PrometheusURL)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authhttp.IsOwner(r.Context()) {
			apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "root only")
			return
		}

		panel := r.URL.Query().Get("panel")
		series, err := client.Query(r.Context(), panel, r.URL.Query().Get("range"))
		switch {
		case errors.Is(err, metrics.ErrUnknownPanel) || errors.Is(err, metrics.ErrBadRange):
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "unknown panel or range")
			return
		case err != nil:
			// Log the upstream detail once; return a generic error so Prometheus
			// internals never leak to the browser.
			logger.Warn("metrics: prometheus query failed", "panel", panel, "err", err)
			apperr.Write(w, http.StatusBadGateway, apperr.SlugInternal, "metric upstream unavailable")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(series); err != nil {
			logger.Warn("metrics: encode response failed", "err", err)
		}
	})
}
