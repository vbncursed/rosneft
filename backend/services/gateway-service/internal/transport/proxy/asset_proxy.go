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

	// Rewrite, not Director: Director is deprecated, and it also appends to
	// whatever X-Forwarded-For the caller sent instead of replacing it.
	// SetXForwarded overwrites the header with the real peer, which is the
	// posture bootstrap/transport.go already documents for the inbound side —
	// a client-supplied X-Forwarded-For is not evidence of anything.
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target) // also blanks Out.Host so the target's host is sent
			r.SetXForwarded()
			// Rewrite "/api/assets/<hash>" to "/assets/<hash>" for asset-service.
			r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/api")
		},
	}, nil
}
