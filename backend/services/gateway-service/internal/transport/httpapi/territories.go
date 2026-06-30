package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

func (s *Server) ListTerritories(ctx context.Context, _ ListTerritoriesRequestObject) (ListTerritoriesResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	out, err := s.svc.ListTerritories(ctx, scopeAdminID)
	if err != nil {
		return ListTerritories500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListTerritories200JSONResponse, len(out))
	for i, t := range out {
		resp[i] = territoryToAPI(t)
	}
	return resp, nil
}

func (s *Server) GetTerritory(ctx context.Context, req GetTerritoryRequestObject) (GetTerritoryResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	t, err := s.svc.GetTerritory(ctx, req.Slug, scopeAdminID)
	switch {
	case isNotFound(err):
		return GetTerritory404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetTerritory500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetTerritory200JSONResponse(territoryToAPI(t)), nil
}

func (s *Server) CreateTerritory(ctx context.Context, req CreateTerritoryRequestObject) (CreateTerritoryResponseObject, error) {
	if req.Body == nil {
		return CreateTerritory400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}}, nil
	}
	t, job, err := s.svc.CreateTerritory(ctx, entityToTerritory(*req.Body))
	switch {
	case isInvalid(err):
		return CreateTerritory400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return CreateTerritory500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreateTerritory202JSONResponse{Territory: territoryToAPI(t), Job: jobToAPI(job)}, nil
}

func (s *Server) ReplaceTerritorySource(ctx context.Context, req ReplaceTerritorySourceRequestObject) (ReplaceTerritorySourceResponseObject, error) {
	if req.Body == nil {
		return ReplaceTerritorySource400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}}, nil
	}
	t, job, err := s.svc.ReplaceTerritorySource(ctx, req.Slug, req.Body.SourceBlobHash)
	switch {
	case isNotFound(err):
		return ReplaceTerritorySource404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case isInvalid(err):
		return ReplaceTerritorySource400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ReplaceTerritorySource500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return ReplaceTerritorySource202JSONResponse{Territory: territoryToAPI(t), Job: jobToAPI(job)}, nil
}

func (s *Server) UpdateTerritory(ctx context.Context, req UpdateTerritoryRequestObject) (UpdateTerritoryResponseObject, error) {
	if req.Body == nil {
		return UpdateTerritory400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: apperr.SlugInvalidInput, Message: "missing body"}}, nil
	}
	t, err := s.svc.UpdateTerritory(ctx, req.Slug, domain.TerritoryUpdate{
		ExternalPanoramaURL: req.Body.ExternalPanoramaUrl,
	})
	switch {
	case isNotFound(err):
		return UpdateTerritory404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case isInvalid(err):
		return UpdateTerritory400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return UpdateTerritory500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return UpdateTerritory200JSONResponse(territoryToAPI(t)), nil
}

func (s *Server) DeleteTerritory(ctx context.Context, req DeleteTerritoryRequestObject) (DeleteTerritoryResponseObject, error) {
	err := s.svc.DeleteTerritory(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return DeleteTerritory404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteTerritory500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeleteTerritory204Response{}, nil
}

func (s *Server) ListTerritoryArtifacts(ctx context.Context, req ListTerritoryArtifactsRequestObject) (ListTerritoryArtifactsResponseObject, error) {
	out, err := s.svc.ListTerritoryArtifacts(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListTerritoryArtifacts404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListTerritoryArtifacts500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListTerritoryArtifacts200JSONResponse, len(out))
	for i, a := range out {
		resp[i] = artifactToAPI(a, false)
	}
	return resp, nil
}

func (s *Server) GetTerritoryArtifact(ctx context.Context, req GetTerritoryArtifactRequestObject) (GetTerritoryArtifactResponseObject, error) {
	a, err := s.svc.GetTerritoryArtifact(ctx, req.Slug, uint32(req.Lod))
	switch {
	case isNotFound(err):
		return GetTerritoryArtifact404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetTerritoryArtifact500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetTerritoryArtifact200JSONResponse(artifactToAPI(a, false)), nil
}

func (s *Server) GetSceneBundle(ctx context.Context, req GetSceneBundleRequestObject) (GetSceneBundleResponseObject, error) {
	scopeAdminID, _ := authhttp.Scope(ctx)
	bundle, err := s.svc.GetSceneBundle(ctx, req.Slug, scopeAdminID)
	switch {
	case isNotFound(err):
		return GetSceneBundle404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetSceneBundle500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetSceneBundle200JSONResponse(sceneBundleToAPI(bundle)), nil
}

// entityToTerritory unwraps the EntityCreate body into a domain Territory
// for CreateTerritory.
func entityToTerritory(body EntityCreate) domain.Territory {
	desc := ""
	if body.Description != nil {
		desc = *body.Description
	}
	panoramaURL := ""
	if body.ExternalPanoramaUrl != nil {
		panoramaURL = *body.ExternalPanoramaUrl
	}
	return domain.Territory{
		// Slug intentionally left empty — the catalog derives it from the
		// title and resolves it to a unique value on create.
		Title:               body.Title,
		Description:         desc,
		ExternalPanoramaURL: panoramaURL,
		SourceBlobHash:      body.SourceBlobHash,
	}
}

// errResp builds the bad-request Error envelope. Use the variants below
// to populate not-found / internal envelopes — they are distinct nominal
// types in the codegen even though all three share the same shape.
func errResp(err error) BadRequestJSONResponse {
	return BadRequestJSONResponse{Code: codeOf(err), Message: errMsg(err)}
}

func notFoundResp(err error) NotFoundJSONResponse {
	return NotFoundJSONResponse{Code: codeOf(err), Message: errMsg(err)}
}

func internalResp(err error) InternalJSONResponse {
	return InternalJSONResponse{Code: codeOf(err), Message: errMsg(err)}
}

func errMsg(err error) string {
	if err == nil {
		return "internal error"
	}
	return err.Error()
}
