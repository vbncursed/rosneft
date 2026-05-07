package bootstrap

import (
	"log/slog"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"

	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/transport/httpapi"
)

// Compile-time assertion: service.Asset satisfies the HTTP transport contract.
var _ httpapi.Service = (*service.Asset)(nil)

// InitMux builds the HTTP mux with healthz + asset handlers mounted. The
// returned healthz handler is already MarkReady'd.
func InitMux(svc *service.Asset, logger *slog.Logger) (*http.ServeMux, *healthz.Handler) {
	mux := http.NewServeMux()

	hz := healthz.New(healthz.Config{Service: "asset-service"})
	hz.Mount(mux)
	hz.MarkReady()

	httpapi.New(svc, logger).Mount(mux)
	return mux, hz
}
