package httpapi

import (
	"context"
)

func (s *Server) InitiateUpload(ctx context.Context, req InitiateUploadRequestObject) (InitiateUploadResponseObject, error) {
	if req.Body == nil {
		return InitiateUpload400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "missing body"}}, nil
	}
	body := *req.Body
	contentType := ""
	if body.ContentType != nil {
		contentType = *body.ContentType
	}
	out, err := s.svc.InitiateUpload(ctx, body.Size, contentType)
	switch {
	case isInvalid(err):
		return InitiateUpload400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return InitiateUpload500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	resp := InitiateUpload201JSONResponse{
		Id:     out.ID,
		Size:   out.Size,
		Offset: out.Offset,
	}
	if contentType != "" {
		resp.ContentType = &contentType
	}
	return resp, nil
}

func (s *Server) AppendUploadChunk(ctx context.Context, req AppendUploadChunkRequestObject) (AppendUploadChunkResponseObject, error) {
	if req.Body == nil {
		return AppendUploadChunk400JSONResponse{BadRequestJSONResponse: BadRequestJSONResponse{Code: "invalid_input", Message: "empty body"}}, nil
	}
	newOffset, err := s.svc.AppendUploadChunk(ctx, req.Id, req.Params.UploadOffset, req.Body)
	switch {
	case isInvalid(err):
		return AppendUploadChunk400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return AppendUploadChunk404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return AppendUploadChunk500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return AppendUploadChunk204Response{Headers: AppendUploadChunk204ResponseHeaders{UploadOffset: &newOffset}}, nil
}

func (s *Server) GetUploadStatus(ctx context.Context, req GetUploadStatusRequestObject) (GetUploadStatusResponseObject, error) {
	out, err := s.svc.GetUploadStatus(ctx, req.Id)
	switch {
	case isNotFound(err):
		return GetUploadStatus404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return GetUploadStatus500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	offset := out.Offset
	size := out.Size
	return GetUploadStatus200Response{Headers: GetUploadStatus200ResponseHeaders{UploadOffset: &offset, UploadLength: &size}}, nil
}

func (s *Server) FinalizeUpload(ctx context.Context, req FinalizeUploadRequestObject) (FinalizeUploadResponseObject, error) {
	out, err := s.svc.FinalizeUpload(ctx, req.Id)
	switch {
	case isInvalid(err):
		return FinalizeUpload400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case isNotFound(err):
		return FinalizeUpload404JSONResponse{NotFoundJSONResponse: notFoundResp(err)}, nil
	case err != nil:
		return FinalizeUpload500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return FinalizeUpload200JSONResponse{Hash: out.Hash, Size: out.Size}, nil
}

func (s *Server) AbortUpload(ctx context.Context, req AbortUploadRequestObject) (AbortUploadResponseObject, error) {
	if err := s.svc.AbortUpload(ctx, req.Id); err != nil {
		return AbortUpload500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	return AbortUpload204Response{}, nil
}
