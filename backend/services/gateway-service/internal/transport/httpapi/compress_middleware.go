package httpapi

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
)

// CompressionMiddleware negotiates `Accept-Encoding` and wraps the response
// writer in a Brotli or gzip encoder. Brotli is preferred (better ratio,
// supported by every browser since 2017); gzip is the universal fallback.
//
// Only JSON responses are compressed — binary content (GLB blobs, images)
// either is already compressed (Draco) or is served by a different handler
// outside this middleware chain.
func CompressionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enc := pickEncoding(r.Header.Get("Accept-Encoding"))
		if enc == "" {
			next.ServeHTTP(w, r)
			return
		}
		cw := &compressWriter{ResponseWriter: w, encoding: enc}
		defer cw.Close()
		next.ServeHTTP(cw, r)
	})
}

// pickEncoding returns "br" or "gzip" — the preferred encoding the client
// supports — or "" when neither is offered.
func pickEncoding(header string) string {
	if header == "" {
		return ""
	}
	hasBr, hasGzip := false, false
	for t := range strings.SplitSeq(header, ",") {
		name, _, _ := strings.Cut(strings.TrimSpace(t), ";")
		switch strings.ToLower(name) {
		case "br":
			hasBr = true
		case "gzip":
			hasGzip = true
		}
	}
	if hasBr {
		return "br"
	}
	if hasGzip {
		return "gzip"
	}
	return ""
}

// compressWriter delays the choice of pass-through vs compress until the
// first Write — that's when Content-Type is finalised and we can decide
// whether to compress this body at all.
type compressWriter struct {
	http.ResponseWriter
	encoding string
	w        io.Writer
	closer   io.Closer
	wrote    bool
}

func (c *compressWriter) WriteHeader(code int) {
	c.prepare()
	c.ResponseWriter.WriteHeader(code)
}

func (c *compressWriter) Write(p []byte) (int, error) {
	if !c.wrote {
		c.prepare()
	}
	if c.w != nil {
		return c.w.Write(p)
	}
	return c.ResponseWriter.Write(p)
}

func (c *compressWriter) Close() {
	if c.closer != nil {
		_ = c.closer.Close()
	}
}

func (c *compressWriter) prepare() {
	if c.wrote {
		return
	}
	c.wrote = true

	ct := c.Header().Get("Content-Type")
	if !isCompressible(ct) {
		return
	}
	switch c.encoding {
	case "br":
		bw := brotli.NewWriter(c.ResponseWriter)
		c.w, c.closer = bw, bw
	case "gzip":
		gw := gzip.NewWriter(c.ResponseWriter)
		c.w, c.closer = gw, gw
	default:
		return
	}
	c.Header().Set("Content-Encoding", c.encoding)
	c.Header().Del("Content-Length")
	c.Header().Set("Vary", combineVary(c.Header().Get("Vary"), "Accept-Encoding"))
}

// isCompressible returns true for JSON-ish content types where compression
// gives real gains. Binary types (images, GLB) are skipped to avoid wasting
// CPU on already-compressed bytes.
func isCompressible(contentType string) bool {
	mime, _, _ := strings.Cut(contentType, ";")
	mime = strings.ToLower(strings.TrimSpace(mime))
	switch mime {
	case "application/json", "application/javascript", "application/xml",
		"text/plain", "text/html", "text/css":
		return true
	}
	return false
}
