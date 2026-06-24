package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// ServeSpec returns the OpenAPI spec as JSON. The spec is parsed from the
// embedded YAML produced by oapi-codegen (`embedded-spec: true`).
func (s *Server) ServeSpec(w http.ResponseWriter, _ *http.Request) {
	spec, err := GetSwagger()
	if err != nil {
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, "spec unavailable")
		return
	}
	data, err := json.Marshal(spec)
	if err != nil {
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, "spec marshal failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(data)
}
