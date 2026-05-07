package httpapi

import (
	"encoding/json"
	"net/http"
)

// ServeSpec returns the OpenAPI spec as JSON. The spec is parsed from the
// embedded YAML produced by oapi-codegen (`embedded-spec: true`).
func (s *Server) ServeSpec(w http.ResponseWriter, _ *http.Request) {
	spec, err := GetSwagger()
	if err != nil {
		http.Error(w, "spec unavailable", http.StatusInternalServerError)
		return
	}
	data, err := json.Marshal(spec)
	if err != nil {
		http.Error(w, "spec marshal failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(data)
}
