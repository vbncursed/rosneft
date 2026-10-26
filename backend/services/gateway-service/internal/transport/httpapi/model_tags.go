package httpapi

import "context"

// ListModelTags needs only a session: the tag list is the same for everyone.
func (s *Server) ListModelTags(ctx context.Context, _ ListModelTagsRequestObject) (ListModelTagsResponseObject, error) {
	out, err := s.svc.ListModelTags(ctx)
	if err != nil {
		return ListModelTags500JSONResponse{InternalJSONResponse: internalResp(ctx, err)}, nil
	}
	return ListModelTags200JSONResponse(modelTagsToAPI(out)), nil
}
