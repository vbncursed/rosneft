package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// auditQueryFromParams maps the user-facing filters onto a domain query.
//
// It deliberately does NOT touch AllCompanies or CompanyID: the tenant scope is
// derived from the session in the service layer. Accepting a company from the
// request would let one Company Owner read another's history.
func auditQueryFromParams(p ListAuditParams) domain.AuditQuery {
	q := domain.AuditQuery{}
	if p.Actor != nil {
		q.ActorID = *p.Actor
	}
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

// auditPrincipal assembles who is asking from the session, never from the
// request. Every audit entry point goes through it so there is one place where
// that rule can be checked.
func auditPrincipal(ctx context.Context) domain.AuditPrincipal {
	return domain.AuditPrincipal{
		IsOwner: authhttp.IsOwner(ctx),
		UserID:  authhttp.UserID(ctx),
		Company: authhttp.AuditCompany(ctx),
		Perms:   authhttp.Perms(ctx),
	}
}

func auditEntryToAPI(e domain.AuditEntry) AuditEntry {
	return AuditEntry{
		Id:            e.ID,
		At:            e.At,
		ActorId:       &e.ActorID,
		ActorLogin:    &e.ActorLogin,
		CompanyId:     &e.CompanyID,
		CompanyLogin:  &e.CompanyLogin,
		Action:        e.Action,
		Entity:        e.Entity,
		EntityId:      &e.EntityID,
		EntityLabel:   &e.EntityLabel,
		OldRow:        &e.OldRow,
		NewRow:        &e.NewRow,
		TerritorySlug: &e.TerritorySlug,
		Result:        AuditEntryResult(e.Result),
	}
}

// ListAudit returns one page of the company journal, scoped to the caller.
func (s *Server) ListAudit(ctx context.Context, req ListAuditRequestObject) (ListAuditResponseObject, error) {
	sc, err := service.AuditScope(auditPrincipal(ctx))
	switch {
	case isForbidden(err):
		return ListAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	case err != nil:
		// Refusal is the only thing AuditScope returns today, but collapsing
		// every future error into 403 would tell a caller they lack a grant
		// when the truth was something else.
		return ListAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	entries, next, refs, err := s.svc.ListAudit(ctx,
		auditQueryFromParams(req.Params), sc, authhttp.Token(ctx), true)
	switch {
	case isForbidden(err):
		return ListAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	case isInvalid(err):
		return ListAudit400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ListAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	page := AuditPage{Entries: make([]AuditEntry, len(entries))}
	for i, e := range entries {
		page.Entries[i] = auditEntryToAPI(e)
	}
	if next > 0 {
		page.NextCursor = &next
	}
	// Пустой словарь не отдаётся: страница без ссылок в снимках — обычное дело
	// (сессионные события, правки заголовков), и пустой объект в каждом таком
	// ответе только раздувал бы его.
	if len(refs) > 0 {
		page.Refs = &refs
	}
	return ListAudit200JSONResponse(page), nil
}

// ListAuditActors returns the actors the caller can filter by.
func (s *Server) ListAuditActors(ctx context.Context, _ ListAuditActorsRequestObject) (ListAuditActorsResponseObject, error) {
	actors, err := s.svc.ListAuditActors(ctx, auditPrincipal(ctx), authhttp.Token(ctx))
	switch {
	case isForbidden(err):
		return ListAuditActors403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	case isInvalid(err):
		return ListAuditActors400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ListAuditActors500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}
	out := make([]AuditActor, len(actors))
	for i, a := range actors {
		out[i] = AuditActor{Id: a.ID, Login: &a.Login}
	}
	return ListAuditActors200JSONResponse(out), nil
}
