package httpapi

import (
	"context"
	"errors"
	"fmt"
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
	assert.DeepEqual(
		s.T(),
		resp,
		ListModelTags200JSONResponse{{Slug: "camp", Title: "Camp"}, {Slug: "ungrouped", Title: "Ungrouped"}},
	)
}

func (s *ModelTagsSuite) TestFailureIsTheGeneric500() {
	resp, err := New(
		tagService{err: errors.New("catalog down at 10.0.0.7")},
	).ListModelTags(s.T().Context(), ListModelTagsRequestObject{})

	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitListModelTagsResponse)
	assert.Equal(s.T(), code, http.StatusInternalServerError)
	assert.Assert(s.T(), !strings.Contains(body, "10.0.0.7"), body)
}

type tagWriteService struct {
	Service
	slug, title string
	err         error
}

func (t *tagWriteService) CreateModelTag(_ context.Context, slug, title string) (domain.ModelTag, error) {
	t.slug, t.title = slug, title
	return domain.ModelTag{Slug: slug, Title: title}, t.err
}

func (t *tagWriteService) UpdateModelTag(_ context.Context, slug, title string) (domain.ModelTag, error) {
	t.slug, t.title = slug, title
	return domain.ModelTag{Slug: slug, Title: title}, t.err
}

func (s *ModelTagsSuite) TestCreateAnswers201WithTheTag() {
	svc := &tagWriteService{}
	resp, err := New(svc).CreateModelTag(s.T().Context(), CreateModelTagRequestObject{
		Body: &CreateModelTagJSONRequestBody{Slug: "welding", Title: "Welding"},
	})

	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitCreateModelTagResponse)
	assert.Equal(s.T(), code, http.StatusCreated)
	assert.Equal(s.T(), body, `{"slug":"welding","title":"Welding"}`+"\n")
	assert.Equal(s.T(), svc.slug, "welding")
}

func (s *ModelTagsSuite) TestUpdateTakesTheSlugFromTheURL() {
	svc := &tagWriteService{}
	resp, err := New(svc).UpdateModelTag(s.T().Context(), UpdateModelTagRequestObject{
		Slug: "camp", Body: &UpdateModelTagJSONRequestBody{Title: "Camps"},
	})

	assert.NilError(s.T(), err)
	code, _ := rendered(s.T(), resp.VisitUpdateModelTagResponse)
	assert.Equal(s.T(), code, http.StatusOK)
	assert.Equal(s.T(), svc.slug+"/"+svc.title, "camp/Camps")
}

func (s *ModelTagsSuite) TestWriteRefusalsAreAt4xxWithTheSentinelWords() {
	invalid := fmt.Errorf("%w: the ungrouped tag cannot be changed", domain.ErrInvalidInput)
	resp, err := New(&tagWriteService{err: invalid}).UpdateModelTag(s.T().Context(), UpdateModelTagRequestObject{
		Slug: "ungrouped", Body: &UpdateModelTagJSONRequestBody{Title: "X"},
	})
	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), resp.VisitUpdateModelTagResponse)
	assert.Equal(s.T(), code, http.StatusBadRequest)
	assert.Assert(s.T(), strings.Contains(body, "the ungrouped tag cannot be changed"), body)

	resp, err = New(
		&tagWriteService{err: domain.ErrModelTagNotFound},
	).UpdateModelTag(s.T().Context(), UpdateModelTagRequestObject{
		Slug: "nope", Body: &UpdateModelTagJSONRequestBody{Title: "X"},
	})
	assert.NilError(s.T(), err)
	code, _ = rendered(s.T(), resp.VisitUpdateModelTagResponse)
	assert.Equal(s.T(), code, http.StatusNotFound)
}

func (s *ModelTagsSuite) TestWriteFailureIsTheGeneric500() {
	boom := errors.New("catalog down at 10.0.0.7")
	for name, visit := range map[string]func() (int, string){
		"create": func() (int, string) {
			resp, _ := New(&tagWriteService{err: boom}).CreateModelTag(s.T().Context(), CreateModelTagRequestObject{
				Body: &CreateModelTagJSONRequestBody{Slug: "ab", Title: "X"},
			})
			return rendered(s.T(), resp.VisitCreateModelTagResponse)
		},
		"update": func() (int, string) {
			resp, _ := New(&tagWriteService{err: boom}).UpdateModelTag(s.T().Context(), UpdateModelTagRequestObject{
				Slug: "camp", Body: &UpdateModelTagJSONRequestBody{Title: "X"},
			})
			return rendered(s.T(), resp.VisitUpdateModelTagResponse)
		},
	} {
		code, body := visit()
		assert.Equal(s.T(), code, http.StatusInternalServerError, name)
		assert.Assert(s.T(), !strings.Contains(body, "10.0.0.7"), body)
	}
}

func (s *ModelTagsSuite) TestMissingBodyIs400() {
	resp, err := New(&tagWriteService{}).CreateModelTag(s.T().Context(), CreateModelTagRequestObject{})
	assert.NilError(s.T(), err)
	code, _ := rendered(s.T(), resp.VisitCreateModelTagResponse)
	assert.Equal(s.T(), code, http.StatusBadRequest)
}

func (t *tagWriteService) DeleteModelTag(_ context.Context, slug string) error {
	t.slug = slug
	return t.err
}

func (s *ModelTagsSuite) TestDeleteResponses() {
	for _, tc := range []struct {
		err  error
		code int
	}{
		{nil, http.StatusNoContent},
		{domain.ErrInvalidInput, http.StatusBadRequest},
		{domain.ErrModelTagNotFound, http.StatusNotFound},
		{domain.ErrModelTagInUse, http.StatusConflict},
		{errors.New("down"), http.StatusInternalServerError},
	} {
		svc := &tagWriteService{err: tc.err}
		resp, err := New(svc).DeleteModelTag(s.T().Context(), DeleteModelTagRequestObject{Slug: "camp"})
		assert.NilError(s.T(), err)
		code, _ := rendered(s.T(), resp.VisitDeleteModelTagResponse)
		assert.Equal(s.T(), code, tc.code)
		assert.Equal(s.T(), svc.slug, "camp")
	}
}
