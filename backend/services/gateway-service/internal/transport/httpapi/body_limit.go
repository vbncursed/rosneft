package httpapi

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// maxJSONBodyBytes caps every request body except the chunk PATCH. The
// largest legitimate bodies are a 1000-point measurement (under 100 KiB even
// with every coordinate at its longest JSON spelling) and a role's full
// permission set (a few KiB); 1 MiB leaves an order of magnitude on top.
const maxJSONBodyBytes = 1 << 20

// LimitBody answers 413 to a body over maxJSONBodyBytes before any handler
// sees it. Without it every handler decoded whatever arrived, whole, into
// memory.
//
// It reads the body up front rather than wrapping it in http.MaxBytesReader
// alone: the strict handlers and authhttp would each turn the reader's error
// into their own 400, and only reading here gives one 413 for all of them.
// Handlers read the whole body anyway, so buffering ≤ 1 MiB costs nothing new.
//
// PATCH /api/uploads/{id} is exempt: it streams raw chunks to upload-service
// 64 KB at a time, and upload-service refuses any byte past the session's
// declared size (itself capped by UPLOAD_MAX_UPLOAD_BYTES at initiate).
//
// Mounted on the root router, so routing has not happened yet and the
// exemption matches the raw path.
func LimitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body == nil || isChunkPatch(r) {
			next.ServeHTTP(w, r)
			return
		}
		// A declared oversize is refused unread; an undeclared one (chunked)
		// only once the reader has crossed the limit.
		if r.ContentLength > maxJSONBodyBytes {
			writeTooLarge(w)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxJSONBodyBytes))
		if _, tooLarge := errors.AsType[*http.MaxBytesError](err); tooLarge {
			writeTooLarge(w)
			return
		}
		if err != nil {
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "cannot read request body")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		next.ServeHTTP(w, r)
	})
}

func writeTooLarge(w http.ResponseWriter) {
	apperr.Write(w, http.StatusRequestEntityTooLarge, apperr.SlugPayloadTooLarge, "request body exceeds 1 MiB")
}

// isChunkPatch matches PATCH /api/uploads/{id} and nothing below it.
func isChunkPatch(r *http.Request) bool {
	id, ok := strings.CutPrefix(r.URL.Path, "/api/uploads/")
	return ok && r.Method == http.MethodPatch && id != "" && !strings.Contains(id, "/")
}
