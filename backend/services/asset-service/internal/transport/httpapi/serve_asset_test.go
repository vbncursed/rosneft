package httpapi_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/transport/httpapi"
)

const (
	testHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	testBody = "<script>alert(1)</script>"
)

type fakeService struct{}

func (fakeService) Stat(context.Context, string) (blobstore.Blob, error) {
	return blobstore.Blob{Hash: testHash, Size: int64(len(testBody)), ContentType: "text/html"}, nil
}

func (fakeService) Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error) {
	b, _ := fakeService{}.Stat(ctx, hash)
	return io.NopCloser(strings.NewReader(testBody)), b, nil
}

func TestServeAssetSecurityHeaders(t *testing.T) {
	mux := http.NewServeMux()
	httpapi.New(fakeService{}, slog.New(slog.DiscardHandler)).Mount(mux)

	tests := []struct {
		name        string
		method      string
		ifNoneMatch string
		status      int
	}{
		{"GET", http.MethodGet, "", http.StatusOK},
		{"HEAD", http.MethodHead, "", http.StatusOK},
		{"conditional GET answers 304", http.MethodGet, `"` + testHash + `"`, http.StatusNotModified},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, "/assets/"+testHash, nil)
			if tt.ifNoneMatch != "" {
				req.Header.Set("If-None-Match", tt.ifNoneMatch)
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
			if got := rec.Header().Get("Content-Security-Policy"); got != "sandbox; default-src 'none'" {
				t.Errorf("Content-Security-Policy = %q", got)
			}
			if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Errorf("X-Content-Type-Options = %q", got)
			}
			// Tenant-scoped behind the gateway: a shared cache must not store it.
			if got := rec.Header().Get("Cache-Control"); got != "private, max-age=31536000, immutable" {
				t.Errorf("Cache-Control = %q", got)
			}
			if got := rec.Header().Get("ETag"); got != `"`+testHash+`"` {
				t.Errorf("ETag = %q, want the quoted hash", got)
			}
			if got := rec.Header().Get("Content-Type"); got != "text/html" {
				t.Errorf("Content-Type = %q, want the stored one", got)
			}
		})
	}
}

type statErrService struct {
	fakeService
	err error
}

func (s statErrService) Stat(context.Context, string) (blobstore.Blob, error) {
	return blobstore.Blob{}, s.err
}

func TestServeAssetStatErrorClasses(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{
			"invalid hash is 400",
			fmt.Errorf("%w: too short", blobstore.ErrInvalidHash),
			http.StatusBadRequest,
			"bad request",
		},
		{"missing blob is 404", blobstore.ErrNotFound, http.StatusNotFound, "404 page not found"},
		{
			"disk failure is 500 with a generic body",
			errors.New("blobstore: read meta: open /data/secret/path: input/output error"),
			http.StatusInternalServerError, "internal error",
		},
		{
			"unparsable meta is 500",
			fmt.Errorf("blobstore: unmarshal meta: %w", errors.New("invalid character")),
			http.StatusInternalServerError, "internal error",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			mux := http.NewServeMux()
			httpapi.New(statErrService{err: tt.err}, slog.New(slog.NewTextHandler(&logs, nil))).Mount(mux)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/assets/"+testHash, nil))

			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != tt.body {
				t.Errorf("body = %q, want %q", got, tt.body)
			}
			if tt.status == http.StatusInternalServerError && !strings.Contains(logs.String(), "input/output error") &&
				!strings.Contains(logs.String(), "invalid character") {
				t.Errorf("detail missing from the log line: %s", logs.String())
			}
		})
	}
}
