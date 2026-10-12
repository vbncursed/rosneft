package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gotest.tools/v3/assert"
)

// /openapi.json is the embedded spec after a round trip through kin-openapi.
// OpenAPI 3.2 has no `nullable`: a null is a member of the type list, and a
// loader that drops the list turns "clear the group" into a plain integer.
func TestServeSpecKeepsVersionAndNullTypes(t *testing.T) {
	rec := httptest.NewRecorder()
	New(struct{ Service }{}).ServeSpec(rec, httptest.NewRequest(http.MethodGet, "/openapi.json", nil))
	assert.Equal(t, rec.Code, http.StatusOK)

	var spec struct {
		OpenAPI    string `json:"openapi"`
		Components struct {
			Schemas map[string]struct {
				Properties map[string]struct {
					Type any `json:"type"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	assert.NilError(t, json.Unmarshal(rec.Body.Bytes(), &spec))
	assert.Equal(t, spec.OpenAPI, "3.2.0")
	assert.DeepEqual(t, spec.Components.Schemas["PlacementsGroupUpdate"].Properties["groupId"].Type, []any{"integer", "null"})
}
