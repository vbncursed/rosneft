package httpapi

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

// serveAsset handles GET/HEAD /assets/{hash}: streams content from the
// service with Range, ETag, and immutable cache headers.
func (h *Handler) serveAsset(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")

	blob, err := h.svc.Stat(r.Context(), hash)
	if err != nil {
		if errors.Is(err, blobstore.ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		// blobstore validates hash format — non-hex, traversal etc. are 400s.
		h.logger.WarnContext(r.Context(), "asset: stat failed", "hash", hash, "err", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Strong ETag = quoted content hash. The hash IS the cache key, so any
	// difference in bytes implies a different hash and a different ETag.
	etag := `"` + blob.Hash + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Content-Type", blob.ContentType)
	// Content-addressed: blob never changes for a given hash, so cache forever.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	if matchEtag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	if r.Method == http.MethodHead {
		w.Header().Set("Content-Length", strconv.FormatInt(blob.Size, 10))
		w.WriteHeader(http.StatusOK)
		return
	}

	rc, _, err := h.svc.Get(r.Context(), hash)
	if err != nil {
		h.logger.ErrorContext(r.Context(), "asset: get failed", "hash", hash, "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer rc.Close()

	// For local FS, the underlying *os.File is io.ReadSeeker, so http.ServeContent
	// handles Range natively. If a future Store (e.g. S3) returns a non-seekable
	// reader, fall back to a plain stream without Range support.
	if rs, ok := rc.(io.ReadSeeker); ok {
		// Empty modtime — content is immutable, do not emit If-Modified-Since match.
		http.ServeContent(w, r, "", time.Time{}, rs)
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(blob.Size, 10))
	if _, err := io.Copy(w, rc); err != nil {
		h.logger.WarnContext(r.Context(), "asset: stream copy failed", "err", err)
	}
}

// matchEtag returns true when the If-None-Match header (which may be a list)
// includes target, or "*". Per RFC 7232 §3.2.
func matchEtag(header, target string) bool {
	if header == "" {
		return false
	}
	if header == "*" {
		return true
	}
	for candidate := range strings.SplitSeq(header, ",") {
		if strings.TrimSpace(candidate) == target {
			return true
		}
	}
	return false
}
