package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
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

	resp, err = New(&tagWriteService{err: domain.ErrModelTagNotFound}).UpdateModelTag(s.T().Context(), UpdateModelTagRequestObject{
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

// Tags are never deleted: the mounted router has no DELETE for a tag, so the
// method is refused before any handler (the stub has none to reach).
func (s *ModelTagsSuite) TestNoDeleteRouteExists() {
	r := chi.NewRouter()
	Mount(r, New(&tagWriteService{}))

	for _, path := range []string{"/api/model-tags", "/api/model-tags/camp"} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequestWithContext(s.T().Context(), http.MethodDelete, path, http.NoBody))
		assert.Equal(s.T(), rec.Code, http.StatusMethodNotAllowed, path)
	}
}
