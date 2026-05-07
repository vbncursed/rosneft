package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
)

// etagBuffer captures Write/WriteHeader so the middleware can compute the
// ETag from the full response body before flushing it through.
type etagBuffer struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (b *etagBuffer) WriteHeader(code int) { b.status = code }

func (b *etagBuffer) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	return b.buf.Write(p)
}

// ETagMiddleware computes a strong ETag (sha256 of the response body) for
// successful GET responses and short-circuits to 304 Not Modified when the
// client's If-None-Match matches. Skipped for non-GET methods (write traffic
// has no caching semantics here) and for non-2xx responses (errors should
// never be cached as ETagged content).
func ETagMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}
		buf := &etagBuffer{ResponseWriter: w}
		next.ServeHTTP(buf, r)

		body := buf.buf.Bytes()
		status := buf.status
		if status == 0 {
			status = http.StatusOK
		}

		if status >= 200 && status < 300 && len(body) > 0 {
			sum := sha256.Sum256(body)
			etag := `"` + hex.EncodeToString(sum[:]) + `"`
			w.Header().Set("ETag", etag)
			w.Header().Set("Vary", combineVary(w.Header().Get("Vary"), "Accept-Encoding"))
			if matchETag(r.Header.Get("If-None-Match"), etag) {
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
		w.WriteHeader(status)
		_, _ = w.Write(body)
	})
}

// matchETag returns true when the client's If-None-Match header (which may
// be a comma-separated list, or "*") matches the computed etag.
func matchETag(header, etag string) bool {
	if header == "" {
		return false
	}
	if strings.TrimSpace(header) == "*" {
		return true
	}
	for candidate := range strings.SplitSeq(header, ",") {
		if strings.TrimSpace(candidate) == etag {
			return true
		}
	}
	return false
}

// combineVary appends an additional value to a Vary header without
// duplicating it.
func combineVary(existing, add string) string {
	if existing == "" {
		return add
	}
	for v := range strings.SplitSeq(existing, ",") {
		if strings.EqualFold(strings.TrimSpace(v), add) {
			return existing
		}
	}
	return existing + ", " + add
}
