package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// modelPatchRecorder captures the patch UpdateModel hands the service.
type modelPatchRecorder struct {
	Service
	got *domain.ModelUpdate
}

func (r modelPatchRecorder) UpdateModel(
	_ context.Context,
	_ string,
	u domain.ModelUpdate,
	_ domain.BlobScope,
) (domain.Model, error) {
	*r.got = u
	return domain.Model{Slug: "pump"}, nil
}

type ModelsHandlerSuite struct{ suite.Suite }

func TestModelsHandlerSuite(t *testing.T) { suite.Run(t, new(ModelsHandlerSuite)) }

func (s *ModelsHandlerSuite) TestUpdateForwardsTitleAndDescription() {
	var got domain.ModelUpdate
	body := UpdateModelJSONRequestBody{Title: new("Pump"), Description: new("")}

	resp, err := New(modelPatchRecorder{got: &got}).UpdateModel(s.T().Context(),
		UpdateModelRequestObject{Slug: "pump", Body: &body})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, domain.ModelUpdate{Title: new("Pump"), Description: new("")})
	_, ok := resp.(UpdateModel200JSONResponse)
	assert.Assert(s.T(), ok, "got %T", resp)
}

const modelHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// rootCtx is a request from Root, who skips the blob-ownership check.
func rootCtx(t *testing.T) context.Context { return authhttp.NewTestContext(t.Context(), true, "") }

// The body carries no tagSlug: there is no default, so the model is refused
// before any catalog call (the mocks expect none, so one would fail).
func TestCreateModelWithoutTagSlugIs400(t *testing.T) {
	body := CreateModelJSONRequestBody{Title: "Cabin", SourceBlobHash: modelHash}

	resp, err := New(gatewayWithoutCalls(t)).CreateModel(rootCtx(t), CreateModelRequestObject{Body: &body})

	assert.NilError(t, err)
	code, out := rendered(t, resp.VisitCreateModelResponse)
	assert.Equal(t, code, http.StatusBadRequest)
	assert.Assert(t, strings.Contains(out, `"code":"invalid_input"`), out)
}

// The catalog refuses an unknown tag in English, starting at the sentinel; the
// body carries exactly those words.
func TestCreateModelUnknownTagIs400English(t *testing.T) {
	mc := minimock.NewController(t)
	cat := mocks.NewCatalogMock(mc)
	cat.UpsertModelMock.Return(
		domain.Model{},
		grpcerr.Refusal{Msg: "invalid input: unknown model tag", Sentinel: domain.ErrInvalidInput},
	)
	svc := service.New(
		cat,
		mocks.NewContentMock(mc),
		mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc),
		mocks.NewAuditMock(mc),
		mocks.NewAuthMock(mc),
	)
	body := CreateModelJSONRequestBody{Title: "Cabin", SourceBlobHash: modelHash, TagSlug: "nope"}

	resp, err := New(svc).CreateModel(rootCtx(t), CreateModelRequestObject{Body: &body})

	assert.NilError(t, err)
	code, out := rendered(t, resp.VisitCreateModelResponse)
	assert.Equal(t, code, http.StatusBadRequest)
	assert.Assert(t, strings.Contains(out, `"message":"invalid input: unknown model tag"`), out)
}

type modelTagRecorder struct {
	Service
	created domain.Model
}

func (m *modelTagRecorder) CreateModel(
	_ context.Context,
	in domain.Model,
	_ domain.BlobScope,
) (domain.Model, domain.Job, error) {
	m.created = in
	in.Tag.Title = "Camp & accommodation"
	return in, domain.Job{}, nil
}

// The tag slug reaches the service, and every Model answered carries its tag.
func TestCreateModelForwardsTheTagAndAnswersIt(t *testing.T) {
	rec := &modelTagRecorder{}
	body := CreateModelJSONRequestBody{Title: "Cabin", SourceBlobHash: modelHash, TagSlug: "camp"}

	resp, err := New(rec).CreateModel(t.Context(), CreateModelRequestObject{Body: &body})

	assert.NilError(t, err)
	assert.Equal(t, rec.created.Tag.Slug, "camp")
	created, ok := resp.(CreateModel202JSONResponse)
	assert.Assert(t, ok, "got %T", resp)
	assert.Equal(t, created.Model.Tag, ModelTag{Slug: "camp", Title: "Camp & accommodation"})
}

func TestUpdateModelForwardsTheTagSlug(t *testing.T) {
	var got domain.ModelUpdate
	body := UpdateModelJSONRequestBody{TagSlug: new("power")}

	_, err := New(
		modelPatchRecorder{got: &got},
	).UpdateModel(t.Context(), UpdateModelRequestObject{Slug: "pump", Body: &body})

	assert.NilError(t, err)
	assert.DeepEqual(t, got, domain.ModelUpdate{TagSlug: new("power")})
}

func TestSceneBundleOptionsCarryTheirTag(t *testing.T) {
	out := sceneBundleToAPI(domain.SceneBundle{ModelOptions: []domain.AssetOption{
		{Slug: "cabin", Tag: domain.ModelTag{Slug: "camp", Title: "Camp"}},
	}})

	assert.Equal(t, out.ModelOptions[0].Tag, ModelTag{Slug: "camp", Title: "Camp"})
}

// Zones in the bundle are [] when there are none, never null.
func TestSceneBundleZonesAreNeverNull(t *testing.T) {
	out := sceneBundleToAPI(domain.SceneBundle{})
	raw, err := json.Marshal(out.Zones)

	assert.NilError(t, err)
	assert.Equal(t, string(raw), "[]")

	zoned := sceneBundleToAPI(domain.SceneBundle{Zones: []domain.Zone{{ID: 7, Title: "Camp"}}})
	assert.Equal(t, zoned.Zones[0].Id, int64(7))
}
