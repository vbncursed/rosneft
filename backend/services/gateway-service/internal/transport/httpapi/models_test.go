package httpapi

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// modelPatchRecorder captures the patch UpdateModel hands the service.
type modelPatchRecorder struct {
	Service
	got *domain.ModelUpdate
}

func (r modelPatchRecorder) UpdateModel(_ context.Context, _ string, u domain.ModelUpdate, _ domain.BlobScope) (domain.Model, error) {
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
