package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type tagService struct {
	Service
	err error
}

func (t tagService) ListModelTags(context.Context) ([]domain.ModelTag, error) {
	return []domain.ModelTag{{Slug: "camp", Title: "Camp"}, {Slug: "ungrouped", Title: "Ungrouped"}}, t.err
}

type ModelTagsSuite struct{ suite.Suite }

func TestModelTagsSuite(t *testing.T) { suite.Run(t, new(ModelTagsSuite)) }

func (s *ModelTagsSuite) TestListKeepsTheCatalogsOrder() {
	resp, err := New(tagService{}).ListModelTags(s.T().Context(), ListModelTagsRequestObject{})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), resp, ListModelTags200JSONResponse{{Slug: "camp", Title: "Camp"}, {Slug: "ungrouped", Title: "Ungrouped"}})
}

func (s *ModelTagsSuite) TestFailureIsTheGeneric500() {
	resp, err := New(tagService{err: errors.New("catalog down at 10.0.0.7")}).ListModelTags(s.T().Context(), ListModelTagsRequestObject{})

	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitListModelTagsResponse)
	assert.Equal(s.T(), code, http.StatusInternalServerError)
	assert.Assert(s.T(), !strings.Contains(body, "10.0.0.7"), body)
}
