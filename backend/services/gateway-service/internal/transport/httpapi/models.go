package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *Server) ListModels(ctx context.Context, _ ListModelsRequestObject) (ListModelsResponseObject, error) {
	out, err := s.svc.ListModels(ctx)
	if err != nil {
		return ListModels500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListModels200JSONResponse, len(out))
	for i, m := range out {
		resp[i] = modelToAPI(m)
	}
	return resp, nil
}

func (s *Server) GetModel(ctx context.Context, req GetModelRequestObject) (GetModelResponseObject, error) {
	m, err := s.svc.GetModel(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return GetModel404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetModel500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetModel200JSONResponse(modelToAPI(m)), nil
}

func (s *Server) CreateModel(ctx context.Context, req CreateModelRequestObject) (CreateModelResponseObject, error) {
	if req.Body == nil {
		return CreateModel400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	m, job, err := s.svc.CreateModel(ctx, entityToModel(*req.Body))
	switch {
	case isInvalid(err):
		return CreateModel400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return CreateModel500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return CreateModel202JSONResponse{Model: modelToAPI(m), Job: jobToAPI(job)}, nil
}

func (s *Server) DeleteModel(ctx context.Context, req DeleteModelRequestObject) (DeleteModelResponseObject, error) {
	err := s.svc.DeleteModel(ctx, req.Slug)
	switch {
	case isInvalid(err):
		return DeleteModel400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return DeleteModel404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return DeleteModel500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return DeleteModel204Response{}, nil
}

func (s *Server) ListModelArtifacts(ctx context.Context, req ListModelArtifactsRequestObject) (ListModelArtifactsResponseObject, error) {
	out, err := s.svc.ListModelArtifacts(ctx, req.Slug)
	switch {
	case isNotFound(err):
		return ListModelArtifacts404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return ListModelArtifacts500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := make(ListModelArtifacts200JSONResponse, len(out))
	for i, a := range out {
		resp[i] = artifactToAPI(a, false)
	}
	return resp, nil
}

func (s *Server) GetModelArtifact(ctx context.Context, req GetModelArtifactRequestObject) (GetModelArtifactResponseObject, error) {
	a, err := s.svc.GetModelArtifact(ctx, req.Slug, uint32(req.Lod))
	switch {
	case isNotFound(err):
		return GetModelArtifact404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetModelArtifact500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return GetModelArtifact200JSONResponse(artifactToAPI(a, false)), nil
}

func entityToModel(body EntityCreate) domain.Model {
	desc := ""
	if body.Description != nil {
		desc = *body.Description
	}
	return domain.Model{
		// Slug intentionally left empty — the catalog derives it from the
		// title and resolves it to a unique value on create.
		Title:          body.Title,
		Description:    desc,
		SourceBlobHash: body.SourceBlobHash,
	}
}
