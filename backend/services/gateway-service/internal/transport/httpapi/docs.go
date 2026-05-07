package httpapi

import (
	_ "embed"
	"net/http"
)

//go:embed scalar.html
var scalarHTML []byte

// ServeDocs renders the Scalar API reference UI. The page loads the spec
// from /openapi.json.
func (s *Server) ServeDocs(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(scalarHTML)
}
