package bootstrap

import (
	"net/http"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/asset"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/proxy"
)

// InitAssetProxy builds the reverse proxy that streams binary artifacts
// from asset-service.
func InitAssetProxy(cfg config.Config) (http.Handler, error) {
	return proxy.New(cfg.AssetHTTPAddr)
}

// InitAssetClient builds the ranged blob reader the territory export uses.
func InitAssetClient(cfg config.Config) (*asset.Client, error) {
	return asset.New(cfg.AssetHTTPAddr)
}
