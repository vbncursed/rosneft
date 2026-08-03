package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListMyAudit returns one page of the caller's own actions.
//
// The scope comes from AuditOwnScope, which pins the actor to the session's
// user id. ListMyAuditParams carries no actor field at all — the route does not
// accept one — so there is nothing here to merge and nothing to forget to
// overwrite. That is the whole difference from ListAudit, whose scope is the
// company and which therefore does honour a submitted actor.
func (s *Server) ListMyAudit(ctx context.Context, req ListMyAuditRequestObject) (ListMyAuditResponseObject, error) {
	sc, err := service.AuditOwnScope(auditPrincipal(ctx))
	switch {
	case isForbidden(err):
		return ListMyAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	case err != nil:
		return ListMyAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	entries, next, refs, err := s.svc.ListAudit(ctx,
		myAuditQuery(req.Params), sc, authhttp.Token(ctx), true)
	switch {
	case isForbidden(err):
		return ListMyAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	case isInvalid(err):
		return ListMyAudit400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ListMyAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	page := AuditPage{Entries: make([]AuditEntry, len(entries))}
	for i, e := range entries {
		page.Entries[i] = auditEntryToAPI(e)
	}
	if next > 0 {
		page.NextCursor = &next
	}
	// Пустой словарь не отдаётся — см. ListAudit.
	if len(refs) > 0 {
		page.Refs = &refs
	}
	return ListMyAudit200JSONResponse(page), nil
}

// myAuditQuery mirrors auditQueryFromParams minus the actor: ListMyAuditParams
// has no such field, because the route does not accept one.
func myAuditQuery(p ListMyAuditParams) domain.AuditQuery {
	q := domain.AuditQuery{}
	if p.Action != nil {
		q.Action = *p.Action
	}
	if p.Entity != nil {
		q.Entity = *p.Entity
	}
	if p.From != nil {
		q.From = *p.From
	}
	if p.To != nil {
		q.To = *p.To
	}
	if p.Cursor != nil {
		q.Cursor = *p.Cursor
	}
	if p.Limit != nil {
		q.Limit = *p.Limit
	}
	return q
}
