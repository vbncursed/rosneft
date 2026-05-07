// Package proxy reverse-proxies binary asset requests to asset-service.
// gateway is the only externally exposed component, but asset-service streams
// large GLB bodies — so we proxy transparently rather than buffer in gateway.
package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// New returns a handler mounted at GET/HEAD /api/assets/{hash} that proxies
// to assetTarget (e.g. http://asset:8081). The downstream URL becomes
// /assets/{hash} — gateway strips the /api prefix.
func New(assetTarget string) (http.Handler, error) {
	target, err := url.Parse(assetTarget)
	if err != nil {
		return nil, fmt.Errorf("proxy: parse %q: %w", assetTarget, err)
	}
	if target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("proxy: target must include scheme and host: %q", assetTarget)
	}

	rp := httputil.NewSingleHostReverseProxy(target)
	originalDirector := rp.Director
	rp.Director = func(r *http.Request) {
		originalDirector(r)
		// Rewrite "/api/assets/<hash>" to "/assets/<hash>" for asset-service.
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api")
		r.Host = target.Host
	}
	return rp, nil
}
