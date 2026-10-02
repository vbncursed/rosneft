package httpapi_test

import (
	"context"
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
			if got := rec.Header().Get("Content-Type"); got != "text/html" {
				t.Errorf("Content-Type = %q, want the stored one", got)
			}
		})
	}
}
