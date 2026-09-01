package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The proxy carries two decisions that a compile cannot check: the /api prefix
// is stripped before asset-service sees the path, and a caller-supplied
// X-Forwarded-For is replaced rather than appended to.
func TestNewRewritesPathAndReplacesForwardedFor(t *testing.T) {
	var gotPath, gotXFF, gotHost string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotXFF, gotHost = r.URL.Path, r.Header.Get("X-Forwarded-For"), r.Host
	}))
	defer upstream.Close()

	h, err := New(upstream.URL)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/assets/deadbeef", nil)
	req.RemoteAddr = "203.0.113.7:54321"
	req.Header.Set("X-Forwarded-For", "10.0.0.1")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if gotPath != "/assets/deadbeef" {
		t.Errorf("path = %q, want /assets/deadbeef", gotPath)
	}
	if gotXFF != "203.0.113.7" {
		t.Errorf("X-Forwarded-For = %q, want the real peer 203.0.113.7 (spoofed value must not survive)", gotXFF)
	}
	if gotHost != upstream.Listener.Addr().String() {
		t.Errorf("Host = %q, want the target host %q", gotHost, upstream.Listener.Addr().String())
	}
}

func TestNewRejectsTargetWithoutSchemeOrHost(t *testing.T) {
	for _, target := range []string{"asset:8081", "/assets", ""} {
		if _, err := New(target); err == nil {
			t.Errorf("New(%q) = nil error, want a rejection", target)
		}
	}
}
