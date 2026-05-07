package bootstrap

import (
	"net/http"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/proxy"
)

// InitAssetProxy builds the reverse proxy that streams binary artifacts
// from asset-service.
func InitAssetProxy(cfg config.Config) (http.Handler, error) {
	return proxy.New(cfg.AssetHTTPAddr)
}
