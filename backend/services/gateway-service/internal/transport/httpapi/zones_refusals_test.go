package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// The catalog refuses in English and the body says so in its words.
func (s *ZonesSuite) TestCatalogRefusalIs400InTheCatalogsWords() {
	s.svc.err = errors.Join(domain.ErrInvalidInput, errors.New("ungrouped cannot be put on a zone"))
	resp, err := s.srv.CreateZone(s.T().Context(), CreateZoneRequestObject{Slug: "yard", Body: &CreateZoneJSONRequestBody{
		Title: "Camp", TagSlugs: []string{"ungrouped"},
	}})

	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitCreateZoneResponse)
	assert.Equal(s.T(), code, http.StatusBadRequest)
	assert.Assert(s.T(), strings.Contains(body, "ungrouped cannot be put on a zone"), body)
}

// A 5xx body is the fixed generic one; what failed goes onto the log line.
func (s *ZonesSuite) TestServerFailureNeverEchoesTheCatalogError() {
	s.svc.err = errors.New("catalog.CreateZone: dial tcp 10.0.0.7:9001: connection refused")
	ctx := s.T().Context()

	list, err := s.srv.ListZones(ctx, ListZonesRequestObject{Slug: "yard"})
	assert.NilError(s.T(), err)
	create, err := s.srv.CreateZone(ctx, CreateZoneRequestObject{Slug: "yard", Body: &CreateZoneJSONRequestBody{}})
	assert.NilError(s.T(), err)
	upd, err := s.srv.UpdateZone(ctx, UpdateZoneRequestObject{Slug: "yard", Id: 1, Body: &UpdateZoneJSONRequestBody{}})
	assert.NilError(s.T(), err)
	del, err := s.srv.DeleteZone(ctx, DeleteZoneRequestObject{Slug: "yard", Id: 1})
	assert.NilError(s.T(), err)

	for _, visit := range []func(http.ResponseWriter) error{
		list.VisitListZonesResponse, create.VisitCreateZoneResponse, upd.VisitUpdateZoneResponse, del.VisitDeleteZoneResponse,
	} {
		code, body := rendered(s.T(), visit)
		assert.Equal(s.T(), code, http.StatusInternalServerError)
		assert.Assert(s.T(), !strings.Contains(body, "10.0.0.7"), body)
		assert.Assert(s.T(), strings.Contains(body, `"code":"internal"`), body)
	}
}
