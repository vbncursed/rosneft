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
		return ListMyAudit403JSONResponse{
			Code:    apperr.SlugForbidden,
			Message: "no audit scope for this principal",
		}, nil
	case err != nil:
		return ListMyAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	q := myAuditQuery(req.Params)
	// The one surface that pages by number: it needs the count. The count is
	// paid on every request of this route — each cursor page, each refetch —
	// but the index is on the actor, so it is a cheap one. The company
	// journal is the one that is polled, and it therefore leaves the flag
	// off; this is the only place it goes on.
	q.IncludeTotal = true
	res, refs, err := s.svc.ListAudit(ctx, q, sc, authhttp.Token(ctx), true)
	switch {
	case isForbidden(err):
		return ListMyAudit403JSONResponse{
			Code:    apperr.SlugForbidden,
			Message: "no audit scope for this principal",
		}, nil
	case isInvalid(err):
		return ListMyAudit400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ListMyAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	page := AuditPage{Entries: make([]AuditEntry, len(res.Entries)), Total: &res.Total}
	for i, e := range res.Entries {
		page.Entries[i] = auditEntryToAPI(e)
	}
	if res.NextCursor > 0 {
		page.NextCursor = &res.NextCursor
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
